import { describe, expect, it } from 'vitest'
import { compareVersions } from './version'

describe('compareVersions', () => {
  it.each([
    ['103.0', '9.0.2', 1],
    ['9.0.2', '103.0', -1],
    ['1.0', '1.0.0', 0],
    ['0.0.1', '0.0.2', -1],
    ['v1.2.3', '1.2.3', 0],
    ['1.0.0-beta', '1.0.0', -1],
    ['1.0.0', '1.0.0-beta', 1],
    ['1.0.0-beta', '1.0.0-rc', 0]
  ] as const)('%s vs %s -> %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected)
  })
})
