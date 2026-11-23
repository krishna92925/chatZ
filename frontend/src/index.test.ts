import { describe, expect, it } from 'vitest'

// Colours from the Vintage Charm palette. These tests protect the contrast claims made in the design plan.
const P = { mauve: '#bcabae', ink: '#0f0f0f', graphite: '#2d2e2e', taupe: '#716969', paper: '#fbfbfb' }

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
function mix(a: string, b: string, pctA: number) {
  const ch = (i: number) => Math.round((parseInt(a.slice(i, i + 2), 16) * pctA + parseInt(b.slice(i, i + 2), 16) * (100 - pctA)) / 100)
  return `#${[1, 3, 5].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`
}

describe('palette contrast (WCAG AA needs 4.5 for body text)', () => {
  it('dark mode body text, accent text and text on accent pass', () => {
    expect(ratio(P.paper, P.ink)).toBeGreaterThan(4.5)
    expect(ratio(P.paper, P.graphite)).toBeGreaterThan(4.5)
    expect(ratio(P.mauve, P.ink)).toBeGreaterThan(4.5)
    expect(ratio(P.mauve, P.graphite)).toBeGreaterThan(4.5)
    expect(ratio(P.ink, P.mauve)).toBeGreaterThan(4.5)
  })
  it('dark mode muted text (paper at 62% over ink) passes on every dark surface', () => {
    const muted = mix(P.paper, P.ink, 62)
    for (const surface of [P.ink, mix(P.graphite, P.ink, 52), P.graphite]) expect(ratio(muted, surface)).toBeGreaterThan(4.5)
  })
  it('light mode text, muted text and bubbles pass', () => {
    expect(ratio(P.ink, P.paper)).toBeGreaterThan(4.5)
    expect(ratio(P.taupe, P.paper)).toBeGreaterThan(4.5)
    expect(ratio(P.ink, mix(P.mauve, P.paper, 22))).toBeGreaterThan(4.5)
    expect(ratio(P.ink, mix(P.mauve, P.paper, 24))).toBeGreaterThan(4.5)
    expect(ratio(mix(P.taupe, P.ink, 78), mix(P.mauve, P.paper, 13))).toBeGreaterThan(4.5)
  })
  it('records the pairs that must never carry small text', () => {
    expect(ratio(P.taupe, P.graphite)).toBeLessThan(4.5)
    expect(ratio(P.mauve, P.paper)).toBeLessThan(4.5)
  })
})
