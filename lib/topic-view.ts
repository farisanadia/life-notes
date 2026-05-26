export interface SizedNote {
  id: string
  w: number
  h: number
}

export interface Positioned {
  id: string
  x: number
  y: number
}

export interface TopicLayoutOptions {
  /** Pixel gap between adjacent cells. Defaults to 24. */
  gap?: number
  /** Forced column count. Defaults to ceil(sqrt(n)). */
  cols?: number
}

/**
 * Lay out `notes` in a row-major grid centred on `viewportCentre`.
 * Cells are uniform: width = max note width + gap, height = max note height + gap.
 * Returns the target top-left coordinate for each note.
 */
export function topicLayout(
  notes: SizedNote[],
  viewportCentre: { x: number; y: number },
  opts: TopicLayoutOptions = {},
): Positioned[] {
  if (notes.length === 0) return []

  const gap = opts.gap ?? 40
  const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(notes.length)))
  const rows = Math.ceil(notes.length / cols)

  let maxW = 0
  let maxH = 0
  for (const n of notes) {
    if (n.w > maxW) maxW = n.w
    if (n.h > maxH) maxH = n.h
  }

  const cellW = maxW + gap
  const cellH = maxH + gap

  // The grid occupies (cols*cellW - gap) × (rows*cellH - gap), with the trailing
  // gap trimmed so the visible block is centred — not the gutter past the edge.
  const blockW = cols * cellW - gap
  const blockH = rows * cellH - gap

  const originX = viewportCentre.x - blockW / 2
  const originY = viewportCentre.y - blockH / 2

  return notes.map((n, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    // Centre each note within its cell so mixed sizes don't look ragged.
    const x = originX + col * cellW + (maxW - n.w) / 2
    const y = originY + row * cellH + (maxH - n.h) / 2
    return { id: n.id, x: Math.round(x), y: Math.round(y) }
  })
}
