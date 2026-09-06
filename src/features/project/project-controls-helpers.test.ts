import { describe, expect, it } from 'vitest'
import { makeProjectSettingsMutation, projectFileName } from './project-controls-helpers'

describe('project controls helpers', () => {
  it('validates and normalizes project settings at commit time', () => {
    const result = makeProjectSettingsMutation({
      name: '  Demo song  ',
      bpm: '127.5',
      beatsPerBar: '7',
      beatUnit: '8',
      totalBars: '128',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        type: 'project/settings',
        name: 'Demo song',
        tempo: { bpm: 127.5, timeSignature: { beatsPerBar: 7, beatUnit: 8 } },
        totalBars: 128,
      },
    })
  })

  it('rejects invalid numeric input without producing a partial mutation', () => {
    const result = makeProjectSettingsMutation({
      name: 'Demo',
      bpm: '120.25',
      beatsPerBar: '4',
      beatUnit: '4',
      totalBars: '64',
    })

    expect(result.ok).toBe(false)
  })

  it('creates a safe download name for browser downloads', () => {
    expect(projectFileName('  Song: night?  ')).toBe('Song_ night_.arrangement.json')
    expect(projectFileName('...')).toBe('arrangement-notes.arrangement.json')
  })
})
