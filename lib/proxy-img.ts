// Rehype plugin: rewrite external http(s) <img src> to go through the
// in-app /api/img-proxy endpoint. This keeps CSP img-src lockable to 'self'
// while still letting users embed remote images — the browser never talks
// to the external host, so tracking pixels can't see user IP / UA / referer.

type ImgNode = {
  type?: string
  tagName?: string
  properties?: { src?: unknown }
  children?: unknown[]
}

function isExternalUrl(src: string): boolean {
  // Absolute http(s) URLs and protocol-relative URLs ('//host/...') both
  // resolve off-origin in a browser. Relative paths and data:/blob: stay
  // local and are left alone.
  return /^https?:\/\//i.test(src) || src.startsWith('//')
}

function toProxyUrl(src: string): string {
  // Normalise protocol-relative to https so the proxy gets a parseable URL.
  const absolute = src.startsWith('//') ? `https:${src}` : src
  return `/api/img-proxy?url=${encodeURIComponent(absolute)}`
}

export function rewriteImgSrcs(node: unknown): void {
  const n = node as ImgNode
  if (n?.type === 'element' && n.tagName === 'img' && typeof n.properties?.src === 'string') {
    const src = n.properties.src
    if (isExternalUrl(src)) n.properties.src = toProxyUrl(src)
  }
  if (Array.isArray(n?.children)) for (const c of n.children) rewriteImgSrcs(c)
}

export const rehypeProxyImages = () => (tree: unknown) => rewriteImgSrcs(tree)
