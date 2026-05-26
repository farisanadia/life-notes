import { syntaxTree } from '@codemirror/language'
import { type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

// "Live preview": markdown is styled inline as you type, and the syntax markers
// (**, #, `, etc.) are hidden unless the caret is on that line — so the editor
// reads like the rendered note but stays plain markdown underneath.

// Inline spans: style the *content* between the markers (avoids decoration
// collisions with the marker-hiding decorations, which share a start offset).
const INLINE_STYLE: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  InlineCode: 'cm-md-code',
}

// Heading nodes → class applied to the heading's text.
const HEADING_STYLE: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
}

// Pure syntax markers — hidden off the active line, dimmed on it.
const MARKER_NODES = new Set(['EmphasisMark', 'CodeMark', 'HeaderMark'])

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.textContent = '•'
    span.className = 'cm-md-bullet'
    return span
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const decos: Range<Decoration>[] = []

  // Lines touched by a cursor/selection — markers on these stay visible.
  const activeLines = new Set<number>()
  for (const r of state.selection.ranges) {
    activeLines.add(state.doc.lineAt(r.from).number)
    activeLines.add(state.doc.lineAt(r.to).number)
  }

  // Iterate the whole doc rather than view.visibleRanges — the latter is
  // empty until the editor measures itself, which means decorations come up
  // empty on the very first render. Notes are short enough that the perf
  // difference is irrelevant.
  syntaxTree(state).iterate({
    from: 0,
    to: state.doc.length,
    enter: (node) => {
      const name = node.name

      if (INLINE_STYLE[name]) {
        const first = node.node.firstChild
        const last = node.node.lastChild
        const innerFrom = first ? first.to : node.from
        const innerTo = last ? last.from : node.to
        if (innerTo > innerFrom) {
          decos.push(
            Decoration.mark({ class: INLINE_STYLE[name] }).range(innerFrom, innerTo),
          )
        }
        return
      }

      if (HEADING_STYLE[name]) {
        const mark = node.node.firstChild // HeaderMark
        const textFrom = mark ? Math.min(mark.to + 1, node.to) : node.from
        if (node.to > textFrom) {
          decos.push(
            Decoration.mark({ class: HEADING_STYLE[name] }).range(textFrom, node.to),
          )
        }
        return
      }

      if (MARKER_NODES.has(name)) {
        // Fenced-code ``` markers are multi-line, so hiding them off the
        // active line leaves the user staring at an unframed code body.
        // Inline `code` backticks stay hideable — they sit on a single line
        // and reading without them matches the rendered output.
        const inFence = name === 'CodeMark' && node.node.parent?.name === 'FencedCode'
        const lineNo = state.doc.lineAt(node.from).number
        if (inFence || activeLines.has(lineNo)) {
          decos.push(Decoration.mark({ class: 'cm-md-marker' }).range(node.from, node.to))
        } else {
          // Swallow the trailing space after a heading's "#" as well.
          let end = node.to
          if (name === 'HeaderMark' && state.doc.sliceString(end, end + 1) === ' ') {
            end += 1
          }
          decos.push(Decoration.replace({}).range(node.from, end))
        }
        return
      }

      if (name === 'ListMark') {
        const text = state.doc.sliceString(node.from, node.to)
        const lineNo = state.doc.lineAt(node.from).number
        if (/^[-*+]$/.test(text) && !activeLines.has(lineNo)) {
          decos.push(
            Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to),
          )
        }
      }
    },
  })

  return Decoration.set(decos, true)
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(u: ViewUpdate) {
      // Re-build on doc/selection changes (typing, caret moves) and also when
      // the language data updates — important on first load, since the parse
      // tree may not be ready when the plugin is first constructed.
      const treeChanged = syntaxTree(u.startState) !== syntaxTree(u.state)
      if (u.docChanged || u.selectionSet || u.viewportChanged || treeChanged) {
        this.decorations = buildDecorations(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
