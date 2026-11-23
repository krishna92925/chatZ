import { describe, expect, it } from 'vitest'
import { formatBytes, formatDayLabel, formatListTime, initials, linkify } from './format'

const now = new Date(2026, 5, 15, 14, 0, 0)
const at = (d: number, h = 9, mi = 5) => new Date(2026, 5, d, h, mi).toISOString()

describe('format', () => {
  it('shows clock for today, then Yesterday, weekday, then date', () => {
    expect(formatListTime(at(15), now)).toBe('09:05')
    expect(formatListTime(at(14), now)).toBe('Yesterday')
    expect(formatListTime(at(11), now)).toBe('Thu')
    expect(formatListTime(at(1), now)).toBe('1 Jun')
    expect(formatListTime(new Date(2025, 11, 25).toISOString(), now)).toBe('25 Dec 2025')
  })
  it('labels days inside a chat', () => {
    expect(formatDayLabel(at(15), now)).toBe('Today')
    expect(formatDayLabel(at(14), now)).toBe('Yesterday')
    expect(formatDayLabel(at(2), now)).toBe('Tue, 2 Jun')
  })
  it('makes initials from one or two words and handles emoji', () => {
    expect(initials('aarav sharma')).toBe('AS')
    expect(initials('Mira')).toBe('M')
    expect(initials('  ')).toBe('?')
    expect(initials('😀 Smile')).toBe('😀S')
  })
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('linkifies only http(s) URLs and keeps trailing punctuation out', () => {
    expect(linkify('see https://example.com/a?b=1, ok')).toEqual([{ text: 'see ' }, { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' }, { text: ', ok' }])
    expect(linkify('javascript:alert(1) and ftp://x.y')).toEqual([{ text: 'javascript:alert(1) and ftp://x.y' }])
  })
})
