import { describe, it, expect } from 'vitest'
import { topicLayout, type SizedNote } from '@/lib/topic-view'

const sized = (id: string, w = 200, h = 200): SizedNote => ({ id, w, h })

describe('topicLayout', () => {
  it('returns empty for no notes', () => {
    expect(topicLayout([], { x: 0, y: 0 })).toEqual([])
  })

  it('places a single note centred on the viewport centre', () => {
    const [out] = topicLayout([sized('a', 200, 200)], { x: 1000, y: 500 })
    // Block is just one note (no trailing gap), centred at (1000,500).
    // x = 1000 - 200/2 = 900, y = 500 - 200/2 = 400.
    expect(out).toEqual({ id: 'a', x: 900, y: 400 })
  })

  it('lays a 4-note grid in 2×2 with uniform spacing', () => {
    const notes = [sized('a'), sized('b'), sized('c'), sized('d')]
    const result = topicLayout(notes, { x: 0, y: 0 }, { gap: 20, cols: 2 })
    // cellW = cellH = 220; block = 440 - 20 = 420; origin = -210,-210.
    expect(result).toEqual([
      { id: 'a', x: -210, y: -210 },
      { id: 'b', x:   10, y: -210 },
      { id: 'c', x: -210, y:   10 },
      { id: 'd', x:   10, y:   10 },
    ])
  })

  it('handles odd counts by leaving the trailing row partial', () => {
    const notes = [sized('a'), sized('b'), sized('c')]
    const result = topicLayout(notes, { x: 0, y: 0 }, { gap: 0, cols: 2 })
    // cellW = cellH = 200; block = 400 × (2*200) = 400×400; origin = -200,-200.
    expect(result).toEqual([
      { id: 'a', x: -200, y: -200 },
      { id: 'b', x:    0, y: -200 },
      { id: 'c', x: -200, y:    0 },
    ])
  })

  it('centres notes of mixed sizes within their cells', () => {
    const notes = [sized('big', 300, 200), sized('small', 100, 100)]
    const result = topicLayout(notes, { x: 0, y: 0 }, { gap: 0, cols: 2 })
    // cellW = 300, cellH = 200. Block: 600×200, origin: -300,-100.
    // big: (300-300)/2 = 0 offset, (200-200)/2 = 0 offset → (-300,-100)
    // small: (300-100)/2 = 100 X-offset, (200-100)/2 = 50 Y-offset → (0+100, -100+50) = (100,-50)
    expect(result[0]).toEqual({ id: 'big',   x: -300, y: -100 })
    expect(result[1]).toEqual({ id: 'small', x:  100, y:  -50 })
  })

  it('uses ceil(sqrt(n)) columns by default', () => {
    // 5 notes → cols = ceil(sqrt(5)) = 3 → 2 rows
    const notes = Array.from({ length: 5 }, (_, i) => sized(String(i), 100, 100))
    const out = topicLayout(notes, { x: 0, y: 0 }, { gap: 0 })
    // Row indices: 0,0,0,1,1
    expect(out[0].y).toBe(out[1].y)
    expect(out[1].y).toBe(out[2].y)
    expect(out[3].y).toBe(out[4].y)
    expect(out[3].y).toBeGreaterThan(out[2].y)
  })
})
