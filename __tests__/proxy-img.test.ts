import { describe, it, expect } from 'vitest'
import { rewriteImgSrcs } from '@/lib/proxy-img'

// Minimal hast-style nodes — enough to exercise the walker without pulling
// in the full unified pipeline.
function img(src: string) {
  return { type: 'element', tagName: 'img', properties: { src }, children: [] }
}
function root(...children: unknown[]) {
  return { type: 'root', children }
}
function el(tag: string, ...children: unknown[]) {
  return { type: 'element', tagName: tag, properties: {}, children }
}

function srcOf(tree: any): string {
  // Walk to find the first <img> and return its src.
  function find(node: any): any {
    if (node?.tagName === 'img') return node
    if (Array.isArray(node?.children)) {
      for (const c of node.children) {
        const f = find(c)
        if (f) return f
      }
    }
    return null
  }
  return find(tree)?.properties?.src
}

describe('rewriteImgSrcs', () => {
  it('rewrites external https URLs to the proxy endpoint', () => {
    const tree = root(img('https://example.com/cat.png'))
    rewriteImgSrcs(tree)
    expect(srcOf(tree)).toBe('/api/img-proxy?url=https%3A%2F%2Fexample.com%2Fcat.png')
  })

  it('rewrites external http URLs', () => {
    const tree = root(img('http://example.com/cat.png'))
    rewriteImgSrcs(tree)
    expect(srcOf(tree)).toBe('/api/img-proxy?url=http%3A%2F%2Fexample.com%2Fcat.png')
  })

  it('rewrites protocol-relative URLs (//host/path) — these would otherwise leak off-origin', () => {
    const tree = root(img('//evil.com/track.png'))
    rewriteImgSrcs(tree)
    // Normalises to https first, then proxies.
    expect(srcOf(tree)).toBe('/api/img-proxy?url=https%3A%2F%2Fevil.com%2Ftrack.png')
  })

  it('leaves same-origin absolute paths alone', () => {
    const tree = root(img('/uploads/local.png'))
    rewriteImgSrcs(tree)
    expect(srcOf(tree)).toBe('/uploads/local.png')
  })

  it('leaves data: URLs alone — sanitizer handles those separately', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo='
    const tree = root(img(data))
    rewriteImgSrcs(tree)
    expect(srcOf(tree)).toBe(data)
  })

  it('walks deeply nested children', () => {
    const tree = root(
      el('p', el('span', img('https://deep.example.com/x.png'))),
    )
    rewriteImgSrcs(tree)
    expect(srcOf(tree)).toBe('/api/img-proxy?url=https%3A%2F%2Fdeep.example.com%2Fx.png')
  })

  it('rewrites multiple images independently', () => {
    const tree = root(
      img('https://a.example.com/1.png'),
      img('/local.png'),
      img('https://b.example.com/2.png'),
    )
    rewriteImgSrcs(tree)
    const srcs = tree.children.map((c: any) => c.properties.src)
    expect(srcs).toEqual([
      '/api/img-proxy?url=https%3A%2F%2Fa.example.com%2F1.png',
      '/local.png',
      '/api/img-proxy?url=https%3A%2F%2Fb.example.com%2F2.png',
    ])
  })

  it('ignores non-img elements with a src attribute', () => {
    // The walker is intentionally narrow — only <img>. Sanitizer already
    // strips <script>/<iframe>/<embed>, but defence in depth: this fn
    // doesn't try to rewrite them.
    const tree = root({
      type: 'element',
      tagName: 'iframe',
      properties: { src: 'https://example.com/frame' },
      children: [],
    })
    rewriteImgSrcs(tree)
    const iframe = (tree.children[0] as any)
    expect(iframe.properties.src).toBe('https://example.com/frame')
  })

  it('preserves query strings and fragments through encoding', () => {
    const tree = root(img('https://example.com/p?q=1&r=2#hash'))
    rewriteImgSrcs(tree)
    // The whole URL goes through encodeURIComponent, including the ?, &, #
    // — that is the point: the proxy reads the value verbatim out of its
    // own ?url= parameter, with no ambiguity.
    expect(srcOf(tree)).toBe(
      '/api/img-proxy?url=' + encodeURIComponent('https://example.com/p?q=1&r=2#hash'),
    )
  })

  it('handles malformed nodes without throwing', () => {
    expect(() => rewriteImgSrcs(null)).not.toThrow()
    expect(() => rewriteImgSrcs(undefined)).not.toThrow()
    expect(() => rewriteImgSrcs({})).not.toThrow()
    expect(() => rewriteImgSrcs({ type: 'element', tagName: 'img' })).not.toThrow()
  })
})
