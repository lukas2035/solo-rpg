import type { GameSession } from '@solo-rpg/shared'

/**
 * Formát souboru `sessions.md` (jeden na hru, čitelný v Obsidianu):
 *
 * ```
 * # Herní sezení
 *
 * Celkem: 3 sezení · 4 h 12 min · průměrná zábavnost 7,5/10
 *
 * ## 14. 9. 2026 20:15 · 1 h 23 min · 7,5/10
 * - Začátek: 2026-09-14T18:15:00.000Z
 * - Konec: 2026-09-14T19:40:12.000Z
 * - Délka (s): 4990
 * - Zábavnost: 7.5
 *
 * Volitelný popis, jak sezení bavilo…
 * ```
 *
 * Nadpis a souhrn jsou jen pro čtení, zdrojem pravdy jsou odrážky pod nadpisem. Id sezení = `startedAt` v ms.
 */

const TITLE = '# Herní sezení'

export function sessionId(startedAt: number): string {
  return String(startedAt)
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

export function formatFun(fun: number): string {
  return `${fun.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}/10`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })
}

function summary(sessions: GameSession[]): string {
  if (sessions.length === 0) return 'Zatím žádné sezení.'
  const total = sessions.reduce((sum, s) => sum + s.durationSeconds, 0)
  const avg = sessions.reduce((sum, s) => sum + s.fun, 0) / sessions.length
  return `Celkem: ${sessions.length} sezení · ${formatDuration(total)} · průměrná zábavnost ${formatFun(Math.round(avg * 10) / 10)}`
}

export function serializeSessions(sessions: GameSession[]): string {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt)
  const blocks = sorted.map(s => {
    const lines = [
      `## ${formatDate(s.startedAt)} · ${formatDuration(s.durationSeconds)} · ${formatFun(s.fun)}`,
      `- Začátek: ${new Date(s.startedAt).toISOString()}`,
      `- Konec: ${new Date(s.endedAt).toISOString()}`,
      `- Délka (s): ${s.durationSeconds}`,
      `- Zábavnost: ${s.fun}`,
    ]
    const description = s.description.trim()
    if (description) lines.push('', description)
    return lines.join('\n')
  })
  return [TITLE, '', summary(sorted), '', ...blocks.flatMap(b => [b, ''])].join('\n').replace(/\n+$/, '\n')
}

const FIELD = /^-\s*([^:]+):\s*(.*)$/

export function parseSessions(raw: string): GameSession[] {
  const sessions: GameSession[] = []
  // Bloky začínají nadpisem 2. úrovně; text před prvním nadpisem (titul, souhrn) se ignoruje
  const blocks = raw.split(/\r?\n(?=## )/).slice(raw.trimStart().startsWith('## ') ? 0 : 1)
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    if (!lines[0]?.startsWith('## ')) continue
    const fields = new Map<string, string>()
    let i = 1
    for (; i < lines.length; i++) {
      const match = lines[i].match(FIELD)
      if (!match) break
      fields.set(match[1].trim().toLowerCase(), match[2].trim())
    }
    const description = lines.slice(i).join('\n').trim()

    const startedAt = Date.parse(fields.get('začátek') ?? '')
    if (Number.isNaN(startedAt)) continue
    const endedAt = Date.parse(fields.get('konec') ?? '')
    const durationSeconds = Number.parseInt(fields.get('délka (s)') ?? '0', 10)
    const fun = Number.parseFloat((fields.get('zábavnost') ?? '0').replace(',', '.'))
    sessions.push({
      id: sessionId(startedAt),
      startedAt,
      endedAt: Number.isNaN(endedAt) ? startedAt + durationSeconds * 1000 : endedAt,
      durationSeconds: Number.isNaN(durationSeconds) ? 0 : Math.max(0, durationSeconds),
      fun: Number.isNaN(fun) ? 0 : Math.min(10, Math.max(0, Math.round(fun * 2) / 2)),
      description,
    })
  }
  return sessions.sort((a, b) => a.startedAt - b.startedAt)
}
