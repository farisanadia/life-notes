import { describe, it, expect } from 'vitest'
import { pushOutOfBbox } from '@/lib/displace'

const bbox = { x: 100, y: 100, w: 200, h: 200 } // 100..300 × 100..300

describe('pushOutOfBbox', () => {
  it('returns null when there is no overlap', () => {
    expect(pushOutOfBbox({ x: 0, y: 0, w: 50, h: 50 }, bbox, 10)).toBeNull()
    expect(pushOutOfBbox({ x: 400, y: 400, w: 50, h: 50 }, bbox, 10)).toBeNull()
  })

  it('treats edge-touch as non-overlap', () => {
    expect(pushOutOfBbox({ x: 50, y: 100, w: 50, h: 50 }, bbox, 10)).toBeNull()
  })

  it('pushes a note overlapping the left edge to the left', () => {
    // note at 80..130 × 150..200 overlaps bbox 100..300
    const out = pushOutOfBbox({ x: 80, y: 150, w: 50, h: 50 }, bbox, 10)
    // pushLeft = 130 - 100 + 10 = 40
    expect(out).toEqual({ dx: -40, dy: 0 })
  })

  it('pushes a note overlapping the right edge to the right', () => {
    const out = pushOutOfBbox({ x: 280, y: 150, w: 50, h: 50 }, bbox, 10)
    // pushRight = 300 - 280 + 10 = 30
    expect(out).toEqual({ dx: 30, dy: 0 })
  })

  it('pushes vertically when vertical displacement is smaller', () => {
    // note at 100..300 × 90..150 (huge horizontal overlap, small vertical)
    const out = pushOutOfBbox({ x: 100, y: 90, w: 200, h: 60 }, bbox, 5)
    // pushUp = 150 - 100 + 5 = 55, pushLeft = 300 - 100 + 5 = 205 → up wins
    expect(out).toEqual({ dx: 0, dy: -55 })
  })

  it('honours the padding so the note clears the bbox edge', () => {
    const out = pushOutOfBbox({ x: 80, y: 150, w: 50, h: 50 }, bbox, 20)!
    // After push, new right edge = 80 + 50 + dx = 130 + (-60) = 70.
    // 70 + 20 padding = 90, < bbox.x = 100 ✓
    expect(out.dx).toBe(-50)
    expect(out.dy).toBe(0)
    const newRight = 80 + 50 + out.dx
    expect(newRight).toBeLessThanOrEqual(bbox.x - 20)
  })
})
