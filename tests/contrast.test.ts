import { describe, expect, it } from 'vitest'
import { TEXT_PAIRS, contrast } from '../src/ui/tokens'

describe('Farbpaare erreichen mindestens 4,5:1', () => {
  for (const [fg, bg, name] of TEXT_PAIRS) {
    it(`${name}: ${fg} auf ${bg}`, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5))
  }
})
