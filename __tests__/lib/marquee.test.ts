import { describe, it, expect } from 'vitest'
import {
  notesInsideMarquee,
  rectFromPoints,
  type BoxedNote,
} from '@/lib/marquee'

const note = (id: string, x: number, y: number, w = 100, h = 100): BoxedNote => ({
  id, x, y, w, h,
})

describe('rectFromPoints', () => {
  it('produces a non-negative rectangle regardless of drag direction', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 100, y: 80 }))
      .toEqual({ x: 10, y: 20, w: 90, h: 60 })

    expect(rectFromPoints({ x: 100, y: 80 }, { x: 10, y: 20 }))
      .toEqual({ x: 10, y: 20, w: 90, h: 60 })
  })

  it('zero-area for a click without drag', () => {
    expect(rectFromPoints({ x: 50, y: 50 }, { x: 50, y: 50 }))
      .toEqual({ x: 50, y: 50, w: 0, h: 0 })
  })
})

describe('notesInsideMarquee', () => {
  it('selects notes whose centre falls inside the rect', () => {
    const notes = [
      note('a', 0,    0),    // centre (50,50)   — inside
      note('b', 200,  0),    // centre (250,50)  — outside
      note('c', 50,   50),   // centre (100,100) — inside
    ]
    const rect = { x: 0, y: 0, w: 150, h: 150 }
    expect(notesInsideMarquee(rect, notes)).toEqual(['a', 'c'])
  })

  it('rejects notes whose centre is past the right/bottom edge', () => {
    const notes = [
      note('a',   0, 0),     // centre (50,50)
      note('b', 100, 100),   // centre (150,150) — past edge
    ]
    expect(notesInsideMarquee({ x: 0, y: 0, w: 140, h: 140 }, notes))
      .toEqual(['a'])
  })

  it('empty array when no centres fall inside', () => {
    const notes = [note('a', 500, 500)]
    expect(notesInsideMarquee({ x: 0, y: 0, w: 100, h: 100 }, notes))
      .toEqual([])
  })

  it('returns all when every centre is inside', () => {
    const notes = [note('a', 0, 0), note('b', 50, 50)]
    expect(notesInsideMarquee({ x: 0, y: 0, w: 200, h: 200 }, notes))
      .toEqual(['a', 'b'])
  })

  it('zero-area rect selects nothing', () => {
    const notes = [note('a', 0, 0)]
    expect(notesInsideMarquee({ x: 50, y: 50, w: 0, h: 0 }, notes))
      .toHaveLength(0)
  })
})
