export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * If `note` overlaps `bbox`, return the displacement (dx, dy) that pushes it
 * just outside the bbox along the axis of minimum travel. Returns null when
 * the rects don't overlap.
 *
 * `padding` is the gap left between the displaced note and the bbox edge.
 */
export function pushOutOfBbox(
  note:    Rect,
  bbox:    Rect,
  padding: number,
): { dx: number; dy: number } | null {
  const nx2 = note.x + note.w
  const ny2 = note.y + note.h
  const bx2 = bbox.x + bbox.w
  const by2 = bbox.y + bbox.h

  if (nx2 <= bbox.x || note.x >= bx2 || ny2 <= bbox.y || note.y >= by2) {
    return null
  }

  const pushLeft  = nx2 - bbox.x + padding
  const pushRight = bx2 - note.x + padding
  const pushUp    = ny2 - bbox.y + padding
  const pushDown  = by2 - note.y + padding

  const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown)

  if (minPush === pushLeft)  return { dx: -pushLeft,  dy: 0 }
  if (minPush === pushRight) return { dx:  pushRight, dy: 0 }
  if (minPush === pushUp)    return { dx: 0, dy: -pushUp  }
  return                            { dx: 0, dy:  pushDown }
}
