import type { ProjectMutation, Result } from '@/domain/editor-contracts'

export const MAX_PROJECT_FILE_SIZE_BYTES = 5 * 1024 * 1024

export type ProjectSettingsMutation = Extract<ProjectMutation, { type: 'project/settings' }>

export interface ProjectSettingsDraft {
  name: string
  bpm: string
  beatsPerBar: string
  beatUnit: string
  totalBars: string
}

export function makeProjectSettingsDraft(project: {
  name: string
  tempo: { bpm: number; timeSignature: { beatsPerBar: number; beatUnit: number } }
  timeline: { totalBars: number }
}): ProjectSettingsDraft {
  return {
    name: project.name,
    bpm: String(project.tempo.bpm),
    beatsPerBar: String(project.tempo.timeSignature.beatsPerBar),
    beatUnit: String(project.tempo.timeSignature.beatUnit),
    totalBars: String(project.timeline.totalBars),
  }
}

function parseFiniteNumber(value: string, label: string): Result<number> {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false, error: `${label}を入力してください。` }
}

function parseInteger(value: string, label: string): Result<number> {
  const parsed = parseFiniteNumber(value, label)
  if (!parsed.ok) return parsed
  return Number.isInteger(parsed.value)
    ? parsed
    : { ok: false, error: `${label}は整数で入力してください。` }
}

export function makeProjectSettingsMutation(draft: ProjectSettingsDraft): Result<ProjectSettingsMutation> {
  const name = draft.name.trim()
  if (name.length < 1 || name.length > 120) {
    return { ok: false, error: 'プロジェクト名は1〜120文字で入力してください。' }
  }

  const bpm = parseFiniteNumber(draft.bpm, 'BPM')
  if (!bpm.ok) return bpm
  if (bpm.value < 20 || bpm.value > 400) {
    return { ok: false, error: 'BPMは20〜400の範囲で入力してください。' }
  }
  if (!/^\d+(\.\d)?$/.test(draft.bpm.trim())) {
    return { ok: false, error: 'BPMは小数第1位までで入力してください。' }
  }

  const beatsPerBar = parseInteger(draft.beatsPerBar, '拍子の分子')
  if (!beatsPerBar.ok) return beatsPerBar
  if (beatsPerBar.value < 1 || beatsPerBar.value > 16) {
    return { ok: false, error: '拍子の分子は1〜16の整数で入力してください。' }
  }

  const beatUnit = parseInteger(draft.beatUnit, '拍子の分母')
  if (!beatUnit.ok) return beatUnit
  if (beatUnit.value !== 2 && beatUnit.value !== 4 && beatUnit.value !== 8 && beatUnit.value !== 16) {
    return { ok: false, error: '拍子の分母は2、4、8、16のいずれかを選択してください。' }
  }

  const totalBars = parseInteger(draft.totalBars, '総小節数')
  if (!totalBars.ok) return totalBars
  if (totalBars.value < 1 || totalBars.value > 1024) {
    return { ok: false, error: '総小節数は1〜1024の整数で入力してください。' }
  }

  return {
    ok: true,
    value: {
      type: 'project/settings',
      name,
      tempo: {
        bpm: bpm.value,
        timeSignature: { beatsPerBar: beatsPerBar.value, beatUnit: beatUnit.value as 2 | 4 | 8 | 16 },
      },
      totalBars: totalBars.value,
    },
  }
}

export function projectFileName(name: string): string {
  const normalized = Array.from(name.trim(), (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character
  }).join('').replace(/[. ]+$/g, '')
  const safeName = normalized || 'arrangement-notes'
  return `${safeName.slice(0, 100)}.arrangement.json`
}
