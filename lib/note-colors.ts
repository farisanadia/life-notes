// Fixed sticky-note palette. Keys are stored in notes.color.

export const NOTE_COLOR_KEYS = [
  'yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'white',
] as const

export type NoteColor = (typeof NOTE_COLOR_KEYS)[number]

// Background classes for the sticky surface (card + editor).
// Both light and dark variants use ~90% opacity so stacked cards bleed through
// each other slightly — gives the board visible depth instead of looking like
// flat opaque tiles.
export const NOTE_COLORS: Record<string, string> = {
  yellow: 'bg-yellow-100/90 dark:bg-yellow-200/90',
  green:  'bg-green-100/90  dark:bg-green-200/90',
  blue:   'bg-blue-100/90   dark:bg-blue-200/90',
  pink:   'bg-pink-100/90   dark:bg-pink-200/90',
  purple: 'bg-purple-100/90 dark:bg-purple-200/90',
  orange: 'bg-orange-100/90 dark:bg-orange-200/90',
  white:  'bg-white/85      dark:bg-neutral-200/95',
}

// Solid swatch classes for the color-picker dots.
export const NOTE_SWATCHES: Record<string, string> = {
  yellow: 'bg-yellow-300',
  green:  'bg-green-300',
  blue:   'bg-blue-300',
  pink:   'bg-pink-300',
  purple: 'bg-purple-300',
  orange: 'bg-orange-300',
  white:  'bg-white border border-neutral-300',
}

export function noteColorClass(color: string): string {
  return NOTE_COLORS[color] ?? NOTE_COLORS.yellow
}
