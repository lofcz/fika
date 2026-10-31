import { runInNewContext } from 'node:vm'
import { describe, expect, it } from '@rstest/core'
import { normalizeAngle } from '@/utils/element'

describe('angle normalization', () => {
  it('preserves signed half-turn boundaries and fractional angles', () => {
    for (const [angle, expected] of [[180, 180], [-180, -180], [540, 180], [-540, -180], [360, 0], [-360, 0], [370.25, 10.25], [-370.25, -10.25]]) {
      expect(normalizeAngle(angle)).toBe(expected)
    }
  })

  it('normalizes very large finite rotations without repeated subtraction', () => {
    const normalize = (angle: number): number => runInNewContext('normalizeAngle(angle)', { normalizeAngle, angle }, { timeout: 1000 })
    expect(normalize(1e20)).toBe(-80)
    expect(normalize(-1e20)).toBe(80)
    expect(normalize(1e12)).toBe(-80)
    expect(normalize(-1e12)).toBe(80)
    expect(Math.abs(normalize(Number.MAX_VALUE))).toBeLessThanOrEqual(180)
  })
})
