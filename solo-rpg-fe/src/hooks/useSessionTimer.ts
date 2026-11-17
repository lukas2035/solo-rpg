import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sessionDraftElapsedMs, sessionDraftRunningSince, type SessionDraft, type SessionDraftEvent } from '@solo-rpg/shared'
import * as api from '../utils/api'

/**
 * Rozepsané herní sezení hry: historie stopek (start / pauza), hodnocení a popis. Ukládá se na BE
 * (per hra), takže přežije obnovení stránky i restart aplikace. Uběhlý čas se neukládá – dopočítává
 * se z historie stopek; běžící stopky se po návratu dopočítají od posledního spuštění.
 */
const EMPTY: SessionDraft = { events: [], fun: 5, description: '' }

/** Běží-li stopky při načtení bez přerušení déle než tohle, nabídne se rozdělení času na hraní a pauzu */
const OVERRUN_MS = 60 * 60 * 1000
/** Odklad uložení při psaní popisu / změně hodnocení; události stopek se ukládají hned */
const SAVE_DEBOUNCE_MS = 600
const RETRY_MS = 5000

/** Stopky při načtení běžely podezřele dlouho: aktuální úsek začal v `since`, zjištěno v `detectedAt` */
export interface SessionOverrun {
  since: number
  detectedAt: number
}

interface Entry {
  game: string
  draft: SessionDraft
  /** Stav ze serveru je načtený – do té doby se nic nemění ani neukládá */
  loaded: boolean
}

interface SaveItem {
  game: string
  draft: SessionDraft
}

const isEmpty = (draft: SessionDraft) => draft.events.length === 0 && draft.fun === EMPTY.fun && draft.description === ''

// ---------- převod starého stavu z localStorage (před ukládáním na BE) ----------

const legacyKey = (game: string) => `solo-rpg:session-timer:${game}`

function readLegacy(game: string): SessionDraft | null {
  try {
    const raw = localStorage.getItem(legacyKey(game))
    if (!raw) return null
    const old = JSON.parse(raw) as { startedAt?: unknown; accumulatedMs?: unknown; runningSince?: unknown; fun?: unknown; description?: unknown }
    const accumulated = typeof old.accumulatedMs === 'number' && old.accumulatedMs > 0 ? Math.floor(old.accumulatedMs) : 0
    const runningSince = typeof old.runningSince === 'number' && old.runningSince > 0 ? Math.floor(old.runningSince) : null
    const events: SessionDraftEvent[] = []
    if (accumulated > 0) {
      // Staré úseky se neuchovávaly – naměřený čas se zapíše jako jeden úsek od začátku sezení
      const start = typeof old.startedAt === 'number' && old.startedAt > 0 ? Math.floor(old.startedAt) : (runningSince ?? Date.now()) - accumulated
      events.push({ type: 'start', at: start }, { type: 'pause', at: start + accumulated })
    }
    if (runningSince !== null) events.push({ type: 'start', at: Math.max(runningSince, events.at(-1)?.at ?? 0) })
    const fun = typeof old.fun === 'number' && old.fun >= 0 && old.fun <= 10 && Number.isInteger(old.fun * 2) ? old.fun : EMPTY.fun
    const draft: SessionDraft = { events, fun, description: typeof old.description === 'string' ? old.description.slice(0, 10000) : '' }
    return isEmpty(draft) ? null : draft
  } catch {
    return null
  }
}

function dropLegacy(game: string): void {
  try {
    localStorage.removeItem(legacyKey(game))
  } catch {
    // localStorage nedostupné – není co mazat
  }
}

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function useSessionTimer(game: string) {
  const [entry, setEntry] = useState<Entry>({ game, draft: EMPTY, loaded: false })
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [overrunEntry, setOverrunEntry] = useState<(SessionOverrun & { game: string }) | null>(null)

  // Aktuální stav pro obsluhu událostí (aby se další stav i uložení počítaly z čerstvých dat)
  const entryRef = useRef(entry)
  const apply = useCallback((next: Entry) => {
    entryRef.current = next
    setEntry(next)
  }, [])

  // ---------- ukládání na BE: nejvýš jeden požadavek naráz, vždy poslední stav ----------

  const saveRef = useRef<{ pending: SaveItem | null; sending: SaveItem | null; timer: number | undefined }>({ pending: null, sending: null, timer: undefined })

  const pumpRef = useRef<() => void>(() => {})
  const pump = useCallback(async () => {
    const queue = saveRef.current
    window.clearTimeout(queue.timer)
    queue.timer = undefined
    if (queue.sending) return
    while (queue.pending) {
      const item = queue.pending
      queue.pending = null
      queue.sending = item
      try {
        await api.saveSessionDraft(item.game, isEmpty(item.draft) ? null : item.draft)
        dropLegacy(item.game)
        setError(null)
      } catch (err) {
        // Neuložený stav vrátit do fronty (pokud mezitím nepřišel novější) a zkusit znovu
        queue.pending ??= item
        setError(`Rozepsané sezení se nepodařilo uložit (${errorMessage(err, 'chyba spojení')}) – zkouším znovu.`)
        queue.timer = window.setTimeout(() => pumpRef.current(), RETRY_MS)
        return
      } finally {
        queue.sending = null
      }
    }
  }, [])
  useEffect(() => {
    pumpRef.current = () => void pump()
  }, [pump])

  const scheduleSave = useCallback(
    (item: SaveItem, immediate: boolean) => {
      const queue = saveRef.current
      queue.pending = item
      window.clearTimeout(queue.timer)
      if (immediate) void pump()
      else queue.timer = window.setTimeout(() => void pump(), SAVE_DEBOUNCE_MS)
    },
    [pump]
  )

  // Obnovení / zavření stránky a odchod ze stránky kampaně: neuložený stav odeslat hned
  useEffect(() => {
    const queue = saveRef.current
    const onPageHide = () => {
      const item = queue.pending ?? queue.sending
      if (!item) return
      queue.pending = null
      window.clearTimeout(queue.timer)
      api.saveSessionDraft(item.game, isEmpty(item.draft) ? null : item.draft, true).catch(() => {
        queue.pending ??= item
      })
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      void pump()
    }
  }, [pump])

  // ---------- načtení stavu hry (při zobrazení stránky kampaně / přepnutí hry) ----------

  useEffect(() => {
    let cancelled = false
    let retry: number | undefined
    const load = () => {
      api
        .getSessionDraft(game)
        .then(({ draft }) => {
          if (cancelled) return
          // Na serveru nic není → převzít případný starý stav z localStorage a hned ho uložit na BE
          const legacy = draft ? null : readLegacy(game)
          const initial = draft ?? legacy ?? EMPTY
          apply({ game, draft: initial, loaded: true })
          setError(null)
          if (legacy) scheduleSave({ game, draft: legacy }, true)
          else dropLegacy(game)
          const since = sessionDraftRunningSince(initial.events)
          const loadedAt = Date.now()
          setNow(loadedAt)
          setOverrunEntry(since !== null && loadedAt - since > OVERRUN_MS ? { game, since, detectedAt: loadedAt } : null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setError(`Rozepsané sezení se nepodařilo načíst (${errorMessage(err, 'chyba spojení')}) – zkouším znovu.`)
          retry = window.setTimeout(load, RETRY_MS)
        })
    }
    load()
    return () => {
      cancelled = true
      window.clearTimeout(retry)
    }
  }, [game, apply, scheduleSave])

  const loaded = entry.game === game && entry.loaded
  const state = loaded ? entry.draft : EMPTY
  const runningSince = sessionDraftRunningSince(state.events)
  const running = runningSince !== null

  // Tikání jen když stopky běží
  useEffect(() => {
    if (runningSince === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [runningSince])

  const update = useCallback(
    (fn: (prev: SessionDraft) => SessionDraft, immediate: boolean) => {
      const current = entryRef.current
      if (current.game !== game || !current.loaded) return
      const draft = fn(current.draft)
      if (draft === current.draft) return
      apply({ ...current, draft })
      scheduleSave({ game, draft }, immediate)
    },
    [game, apply, scheduleSave]
  )

  const start = useCallback(() => {
    setNow(Date.now())
    update(prev => {
      const last = prev.events.at(-1)
      if (last?.type === 'start') return prev
      return { ...prev, events: [...prev.events, { type: 'start', at: Math.max(Date.now(), last?.at ?? 0) }] }
    }, true)
  }, [update])

  const pause = useCallback(() => {
    update(prev => {
      const last = prev.events.at(-1)
      if (last?.type !== 'start') return prev
      return { ...prev, events: [...prev.events, { type: 'pause', at: Math.max(Date.now(), last.at) }] }
    }, true)
  }, [update])

  /** Vynuluje jen čas; rozepsané hodnocení zůstává */
  const reset = useCallback(() => update(prev => (prev.events.length ? { ...prev, events: [] } : prev), true), [update])

  /** Po uložení sezení: vynulovat stopky i hodnocení */
  const clear = useCallback(() => update(prev => (isEmpty(prev) ? prev : EMPTY), true), [update])

  const setFun = useCallback((fun: number) => update(prev => (prev.fun === fun ? prev : { ...prev, fun }), false), [update])
  const setDescription = useCallback((description: string) => update(prev => (prev.description === description ? prev : { ...prev, description }), false), [update])

  const overrun: SessionOverrun | null = overrunEntry && overrunEntry.game === game && overrunEntry.since === runningSince ? overrunEntry : null

  const dismissOverrun = useCallback(() => setOverrunEntry(null), [])

  /**
   * Rozdělí dlouho běžící úsek: prvních `keepMs` se započítá, zbytek až do teď je pauza.
   * `resume` = stopky poté běží dál od teď, jinak zůstanou v pauze.
   */
  const resolveOverrun = useCallback(
    (found: SessionOverrun, keepMs: number, resume: boolean) => {
      setOverrunEntry(null)
      setNow(Date.now())
      update(prev => {
        const last = prev.events.at(-1)
        if (last?.type !== 'start' || last.at !== found.since) return prev
        const current = Date.now()
        // Celý čas zjištěný při načtení = ponechat vše včetně doby, kdy byl dialog otevřený
        const keepAll = keepMs >= found.detectedAt - found.since
        if (keepAll && resume) return prev
        const pauseAt = keepAll ? Math.max(current, last.at) : last.at + Math.max(0, Math.round(keepMs))
        const events: SessionDraftEvent[] = [...prev.events, { type: 'pause', at: pauseAt }]
        if (resume) events.push({ type: 'start', at: Math.max(current, pauseAt) })
        return { ...prev, events }
      }, true)
    },
    [update]
  )

  const elapsed = useMemo(() => sessionDraftElapsedMs(state.events, now), [state.events, now])
  /** Kdy sezení začalo (první spuštění); null = stopky vynulované */
  const startedAt = state.events[0]?.at ?? null

  return { state, loaded, error, running, elapsed, startedAt, overrun, start, pause, reset, clear, setFun, setDescription, resolveOverrun, dismissOverrun }
}
