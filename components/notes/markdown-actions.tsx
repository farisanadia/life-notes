import type { ReactNode } from 'react'

// Editor-agnostic formatting action descriptors. Both the textarea-style
// toolbar (legacy) and the CodeMirror live editor execute these.
export type MarkdownAction =
  // Wrap the current selection (or insert at the caret) with `before`/`after`.
  | { kind: 'wrap'; before: string; after: string }
  // Add a prefix at the start of the line the caret sits on.
  | { kind: 'line'; prefix: string }
  // Insert a multi-line block at the caret. `cursorOffset` (if given) is the
  // number of characters from the start of `text` to place the caret after
  // insertion — useful for landing inside a table cell or code fence.
  | { kind: 'block'; text: string; cursorOffset?: number }

export interface MarkdownActionDef {
  title: string
  icon: ReactNode
  action: MarkdownAction
}

const TABLE_TEMPLATE =
  '| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n'

const CODE_BLOCK_TEMPLATE = '```\n\n```\n'

export const MARKDOWN_ACTIONS: MarkdownActionDef[] = [
  // Inline marks
  { title: 'Bold (⌘B)',     icon: <span className="font-bold">B</span>,             action: { kind: 'wrap', before: '**', after: '**' } },
  { title: 'Italic (⌘I)',   icon: <span className="italic">I</span>,                action: { kind: 'wrap', before: '*',  after: '*'  } },
  { title: 'Strikethrough', icon: <span className="line-through">S</span>,          action: { kind: 'wrap', before: '~~', after: '~~' } },
  { title: 'Inline code',   icon: <span className="font-mono text-[10px]">{'<>'}</span>, action: { kind: 'wrap', before: '`',  after: '`'  } },

  // Line marks
  { title: 'Heading',       icon: <span className="font-semibold">H</span>,         action: { kind: 'line', prefix: '## ' } },
  { title: 'List',          icon: <span>•</span>,                                   action: { kind: 'line', prefix: '- ' } },
  { title: 'Task list',     icon: <span className="text-[11px]">☐</span>,           action: { kind: 'line', prefix: '- [ ] ' } },
  { title: 'Quote',         icon: <span>&ldquo;</span>,                             action: { kind: 'line', prefix: '> ' } },

  // Block / special inserts
  { title: 'Code block',    icon: <span className="font-mono text-[9px] leading-none">{'```'}</span>,
    action: { kind: 'block', text: CODE_BLOCK_TEMPLATE, cursorOffset: 4 } },
  { title: 'Table',
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M2 7h12M2 10h12M6 3v10M10 3v10" />
      </svg>
    ),
    action: { kind: 'block', text: TABLE_TEMPLATE, cursorOffset: 2 } },
  { title: 'Horizontal rule', icon: <span className="text-base leading-none">―</span>,
    action: { kind: 'block', text: '---\n' } },
  // Placeholder is `https://` rather than `url` so the live preview's
  // <img>/<a> doesn't auto-fetch a relative `/url` (404 + privacy leak).
  { title: 'Image', icon: <span className="text-[10px]">img</span>,
    action: { kind: 'wrap', before: '![', after: '](https://)' } },
  { title: 'Link',  icon: <span className="text-[11px] underline">link</span>,
    action: { kind: 'wrap', before: '[', after: '](https://)' } },
]
