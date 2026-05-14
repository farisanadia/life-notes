'use client'

import { useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, keymap } from '@codemirror/view'
import { EditorSelection, Prec } from '@codemirror/state'
import { livePreview } from '@/components/notes/livePreview'
import { MARKDOWN_ACTIONS, type MarkdownAction } from '@/components/notes/markdown-actions'

// Transparent, chrome-free editor so the sticky colour shows through, plus the
// inline-styling classes the livePreview plugin attaches.
const editorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#171717', height: '100%' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.55', overflow: 'auto' },
    '.cm-content': {
      padding: '2px 0',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '12.5px',
      caretColor: '#111',
    },
    '.cm-line': { padding: '0' },
    // Full shorthand so we don't fight whatever the base theme set.
    '.cm-cursor, .cm-dropCursor': {
      borderLeft: '2px solid #111',
      marginLeft: '-1px',
    },
    // Show the drawn cursor when the editor is focused (the base only does
    // this for some specificity orderings; force it explicitly here).
    '&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor': {
      display: 'block',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(0,0,0,0.14)',
    },
    '.cm-placeholder': { color: 'rgba(0,0,0,0.4)' },
    '.cm-md-strong': { fontWeight: '700' },
    '.cm-md-em': { fontStyle: 'italic' },
    '.cm-md-code': {
      fontFamily: 'ui-monospace, monospace',
      backgroundColor: 'rgba(0,0,0,0.07)',
      borderRadius: '3px',
      padding: '0 3px',
    },
    '.cm-md-marker': { opacity: '0.4' },
    '.cm-md-bullet': { color: 'rgba(0,0,0,0.55)' },
    '.cm-md-h1': { fontSize: '1.55em', fontWeight: '700' },
    '.cm-md-h2': { fontSize: '1.32em', fontWeight: '700' },
    '.cm-md-h3': { fontSize: '1.15em', fontWeight: '600' },
    '.cm-md-h4': { fontSize: '1.05em', fontWeight: '600' },
    '.cm-md-h5': { fontWeight: '600' },
    '.cm-md-h6': { fontWeight: '600' },
  },
  { dark: false },
)

function wrapSelection(view: EditorView, before: string, after: string) {
  view.dispatch(
    view.state.changeByRange(range => ({
      changes: [
        { from: range.from, insert: before },
        { from: range.to, insert: after },
      ],
      range: EditorSelection.range(
        range.from + before.length,
        range.to + before.length,
      ),
    })),
  )
  view.focus()
}

function prefixLine(view: EditorView, prefix: string) {
  const head = view.state.selection.main.head
  const line = view.state.doc.lineAt(head)
  view.dispatch({
    changes: { from: line.from, insert: prefix },
    selection: EditorSelection.cursor(head + prefix.length),
  })
  view.focus()
}

// Insert a multi-line block at the caret. Adds a leading/trailing newline if
// the caret isn't at a line boundary, so a table or HR doesn't fuse onto a
// half-written line.
function insertBlock(view: EditorView, text: string, cursorOffset?: number) {
  const head = view.state.selection.main.head
  const line = view.state.doc.lineAt(head)
  const lineEmpty = line.length === 0
  const atLineStart = head === line.from
  const atLineEnd = head === line.to
  const prefix = !atLineStart && !lineEmpty ? '\n' : ''
  const suffix = !atLineEnd ? '\n' : ''
  const insert = prefix + text + suffix
  const cursorAt =
    cursorOffset != null ? head + prefix.length + cursorOffset : head + insert.length
  view.dispatch({
    changes: { from: head, insert },
    selection: EditorSelection.cursor(cursorAt),
  })
  view.focus()
}

function execAction(view: EditorView, action: MarkdownAction) {
  if (action.kind === 'wrap') wrapSelection(view, action.before, action.after)
  else if (action.kind === 'line') prefixLine(view, action.prefix)
  else insertBlock(view, action.text, action.cursorOffset)
}

interface Props {
  value: string
  onChange: (value: string) => void
  onExit: () => void
  /**
   * Use a larger font/leading for the full editor screen. Defaults to compact
   * (board-card) sizing.
   */
  variant?: 'card' | 'editor'
}

export function MarkdownLiveEditor({ value, onChange, onExit, variant = 'card' }: Props) {
  const cmRef = useRef<ReactCodeMirrorRef>(null)

  const extensions = [
    markdown(),
    livePreview,
    EditorView.lineWrapping,
    Prec.high(
      keymap.of([
        {
          key: 'Mod-b',
          run: v => {
            wrapSelection(v, '**', '**')
            return true
          },
        },
        {
          key: 'Mod-i',
          run: v => {
            wrapSelection(v, '*', '*')
            return true
          },
        },
        {
          key: 'Escape',
          run: () => {
            onExit()
            return true
          },
        },
      ]),
    ),
  ]

  function runAction(action: MarkdownAction) {
    const view = cmRef.current?.view
    if (view) execAction(view, action)
  }

  const isEditor = variant === 'editor'

  return (
    <div
      className={`flex h-full flex-col ${isEditor ? 'cm-variant-editor' : ''}`}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Formatting toolbar — only in the full editor; cards are too tight for it.
          ⌘B / ⌘I still work on cards via the keymap below. */}
      {isEditor && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-black/10 pb-1">
          {MARKDOWN_ACTIONS.map(a => (
            <button
              key={a.title}
              type="button"
              title={a.title}
              aria-label={a.title}
              onClick={e => {
                e.stopPropagation()
                runAction(a.action)
              }}
              className="flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs text-neutral-700 hover:bg-black/10"
            >
              {a.icon}
            </button>
          ))}
        </div>
      )}

      {/* Live-preview CodeMirror editor */}
      <div className={`min-h-0 flex-1 ${isEditor ? 'pt-1' : ''}`}>
        <CodeMirror
          ref={cmRef}
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme={editorTheme}
          height="100%"
          autoFocus
          placeholder="Write in markdown…"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            highlightSelectionMatches: false,
            searchKeymap: false,
            autocompletion: false,
            bracketMatching: false,
            closeBrackets: false,
            syntaxHighlighting: false,
          }}
          className="h-full"
        />
      </div>
    </div>
  )
}
