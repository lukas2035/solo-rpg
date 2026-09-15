import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Stav stopek herního sezení. Ukládá se do localStorage per hra, takže přežije zavření dialogu
 * i obnovení stránky; běžící stopky se po návratu dopočítají z `runningSince`.
 */
export interface SessionTimerState {
  /** Kdy sezení začalo (první spuštění); null = stopky vynulované */
  startedAt: number | null
  /** Načtený čas z dokončených úseků (ms) */
  accumulatedMs: number
  /** Začátek aktuálně běžícího úseku (ms); null = pauza */
  runningSince: number | null
  /** Rozepsané hodnocení – aby se neztratilo při zavření dialogu */
  fun: number
  description: string
}

const EMPTY: SessionTimerState = { startedAt: null, accumulatedMs: 0, runningSince: null, fun: 5, description: '' }

const storageKey = (game: string) => `solo-rpg:session-timer:${game}`

function load(game: string): SessionTimerState {
  try {
    const raw = localStorage.getItem(storageKey(game))
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<SessionTimerState>
    return { ...EMPTY, ...parsed }
  } catch {
    return EMPTY
  }
}

export function elapsedMs(state: SessionTimerState, now = Date.now()): number {
  return state.accumulatedMs + (state.runningSince !== null ? Math.max(0, now - state.runningSince) : 0)
}

export function useSessionTimer(game: string) {
  // Stav se váže na hru; při přepnutí hry (bez remountu) se při dalším renderu načte její uložený stav
  const [entry, setEntry] = useState(() => ({ game, state: load(game) }))
  const [now, setNow] = useState(() => Date.now())
  const state = entry.game === game ? entry.state : load(game)

  useEffect(() => {
    localStorage.setItem(storageKey(game), JSON.stringify(state))
  }, [game, state])

  // Tikání jen když stopky běží
  useEffect(() => {
    if (state.runningSince === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state.runningSince])

  const update = useCallback(
    (fn: (prev: SessionTimerState) => SessionTimerState) =>
      setEntry(prev => ({ game, state: fn(prev.game === game ? prev.state : load(game)) })),
    [game]
  )

  const start = useCallback(() => {
    setNow(Date.now())
    update(prev => (prev.runningSince !== null ? prev : { ...prev, startedAt: prev.startedAt ?? Date.now(), runningSince: Date.now() }))
  }, [update])

  const pause = useCallback(() => {
    update(prev => (prev.runningSince === null ? prev : { ...prev, accumulatedMs: elapsedMs(prev), runningSince: null }))
  }, [update])

  /** Vynuluje jen čas; rozepsané hodnocení zůstává */
  const reset = useCallback(() => update(prev => ({ ...EMPTY, fun: prev.fun, description: prev.description })), [update])

  /** Po uložení sezení: vynulovat stopky i hodnocení */
  const clear = useCallback(() => update(() => EMPTY), [update])

  const setFun = useCallback((fun: number) => update(prev => ({ ...prev, fun })), [update])
  const setDescription = useCallback((description: string) => update(prev => ({ ...prev, description })), [update])

  const running = state.runningSince !== null
  // V pauze je čas přesně v accumulatedMs; jen za běhu se dopočítává z tikajícího `now`
  const elapsed = useMemo(() => (running ? elapsedMs(state, now) : state.accumulatedMs), [state, now, running])

  return { state, running, elapsed, start, pause, reset, clear, setFun, setDescription }
}
