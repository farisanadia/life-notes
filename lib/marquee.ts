export interface MarqueeRect {
  x: number
  y: number
  w: number
  h: number
}

export interface BoxedNote {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Normalise a pointerdown → pointermove pair into a non-negative rectangle. */
export function rectFromPoints(
  start: { x: number; y: number },
  end:   { x: number; y: number },
): MarqueeRect {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return {
    x,
    y,
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  }
}

/** Notes whose centre falls inside `rect`. Order matches `notes`. */
export function notesInsideMarquee(
  rect:  MarqueeRect,
  notes: BoxedNote[],
): string[] {
  if (rect.w <= 0 || rect.h <= 0) return []
  const x2 = rect.x + rect.w
  const y2 = rect.y + rect.h
  const ids: string[] = []
  for (const n of notes) {
    const cx = n.x + n.w / 2
    const cy = n.y + n.h / 2
    if (cx >= rect.x && cx <= x2 && cy >= rect.y && cy <= y2) {
      ids.push(n.id)
    }
  }
  return ids
}
