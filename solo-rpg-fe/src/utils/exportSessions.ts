import { sessionDurationSeconds, type GameSession } from '@solo-rpg/shared'

export function formatSessionDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

export const formatSessionFun = (fun: number) => fun.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })

export const formatSessionDate = (ms: number) =>
  new Date(ms).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Markdown export vybraných herních sezení (schránka / soubor). Obsahuje souhrn a u každého sezení
 * začátek, konec, dobu (vč. naměřené, pokud byla ručně upravena), hodnocení a popis.
 */
export function buildSessionsMarkdown(gameName: string, sessions: GameSession[], totalCount: number): string {
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt)
  const total = sorted.reduce((sum, s) => sum + sessionDurationSeconds(s), 0)
  const avg = sorted.length ? sorted.reduce((sum, s) => sum + s.fun, 0) / sorted.length : 0
  const isSelection = sorted.length < totalCount

  const out: string[] = [`# Herní sezení – ${gameName}`, '']
  out.push(
    isSelection
      ? `Výběr ${sorted.length} z ${totalCount} sezení · ${formatSessionDuration(total)} · průměrná zábavnost ${formatSessionFun(Math.round(avg * 10) / 10)}/10`
      : `Celkem: ${sorted.length} sezení · ${formatSessionDuration(total)} · průměrná zábavnost ${formatSessionFun(Math.round(avg * 10) / 10)}/10`
  )
  out.push('')

  for (const s of sorted) {
    const duration = sessionDurationSeconds(s)
    out.push(`## ${formatSessionDate(s.startedAt)} · ${formatSessionDuration(duration)} · ${formatSessionFun(s.fun)}/10`)
    out.push(`- Začátek: ${formatSessionDate(s.startedAt)}`)
    out.push(`- Uloženo: ${formatSessionDate(s.endedAt)}`)
    if (s.customDurationSeconds !== undefined) {
      out.push(`- Doba: ${formatSessionDuration(duration)} (vlastní nastavená doba)`)
      out.push(`- Naměřeno stopkami: ${formatSessionDuration(s.durationSeconds)}`)
    } else {
      out.push(`- Doba: ${formatSessionDuration(duration)}`)
    }
    out.push(`- Zábavnost: ${formatSessionFun(s.fun)}/10`)
    const description = s.description.trim()
    if (description) out.push('', description)
    out.push('')
  }

  return out.join('\n').replace(/\n+$/, '\n')
}

export function sessionsExportFileName(gameName: string, selection = false): string {
  const safe = gameName.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'hra'
  return `${safe}-sezeni${selection ? '-vyber' : ''}.md`
}
