import { useState } from 'react'
import type { BeatKind, BriefPatch, CampaignPulse, DirectorEvent, DirectorState, EventType, ObstacleKind, PacingPhase, PulseOverride, RollOutcome, Stakes } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'

interface DirectorPanelProps {
  state: DirectorState
  /** Probíhá volání Directoru (brief / patch / skip) */
  busy: boolean
  /** AI právě píše podle briefu – brief je jen ke čtení */
  aiBusy: boolean
  /** Návrh AI podle tohoto briefu už existuje (čeká na přijetí) – nepsat znovu, jen zobrazit */
  suggestionPending: boolean
  /** Scéna má zapnutou AI a hra má vypravěče – lze psát */
  canWrite: boolean
  threadOptions: string[]
  questOptions: string[]
  onCreate: (seed?: number) => void
  onPatch: (patch: BriefPatch) => void
  /** Zahodit brief a nechat AI psát bez režie */
  onSkip: () => void
  onWrite: () => void
  onClose: () => void
  onPulseOverride: (override: PulseOverride) => void
  /** Uzavřít probíhající událost: brief rozuzlení s celkovým výsledkem */
  onResolveEvent: (outcome: RollOutcome | null) => void
  /** Zahodit probíhající událost bez rozuzlení */
  onAbandonEvent: () => void
  darken?: boolean
}

const PHASE_LABEL: Record<PacingPhase, string> = { calm: 'klid', rising: 'stoupá', peak: 'vrchol', aftermath: 'dozvuky' }
const EVENT_LABEL: Record<EventType, string> = { obstacle: 'překážka', neutral: 'neutrální událost', opportunity: 'příležitost', reward: 'odměna' }
const OBSTACLE_LABEL: Record<ObstacleKind, string> = {
  check: 'zkouška dovednosti',
  social: 'sociální střet',
  encounter: 'střet / boj',
  hazard: 'nebezpečí prostředí',
  dilemma: 'dilema (volba bez hodu)',
}
const NO_ROLL_OBSTACLE: ReadonlySet<ObstacleKind> = new Set(['encounter', 'dilemma'])
const BEAT_SHORT: Record<BeatKind, string> = { escalation: 'eskalace', consequence: 'následek', resolution: 'rozuzlení', reveal: 'zvrat' }

function EventStrip({ event, locked, onResolve, onAbandon }: { event: DirectorEvent; locked: boolean; onResolve: (o: RollOutcome | null) => void; onAbandon: () => void }) {
  const title = `${EVENT_LABEL[event.eventType]}${event.obstacleKind ? ` – ${OBSTACLE_LABEL[event.obstacleKind]}` : ''}`
  const beats = event.beats.map(b => {
    const parts = [BEAT_SHORT[b.beatKind]]
    if (b.rollPhase === 'before') parts.push(b.difficulty !== null ? `před hodem ${b.difficulty}/5` : 'před střetem')
    if (b.outcome) parts.push(OUTCOME_LABEL[b.outcome])
    return parts.join(' · ')
  })
  return (
    <div className="flex flex-col gap-1 text-xs text-amber-100/90">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-amber-200">⚡ Probíhající událost</span>
        <span>{title}</span>
        <span className="text-amber-200/70">sázky {STAKES_LABEL[event.stakes]}</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-amber-200/70" title="Nechat AI napsat rozuzlení s tímto celkovým výsledkem">uzavřít:</span>
          {(Object.keys(OUTCOME_LABEL) as RollOutcome[]).map(o => (
            <button key={o} type="button" onClick={() => onResolve(o)} disabled={locked} className={`${btn} px-2 py-0 border-amber-300/50 hover:border-amber-200`}>{OUTCOME_LABEL[o]}</button>
          ))}
          <button type="button" onClick={() => onResolve(null)} disabled={locked} className={`${btn} px-2 py-0 border-amber-300/50 hover:border-amber-200`} title="Rozuzlení bez výsledku hodu">bez hodu</button>
          <button type="button" onClick={onAbandon} disabled={locked} className={`${btn} px-2 py-0 border-red-400/50 text-red-200 hover:border-red-300`} title="Zahodit událost bez rozuzlení (beaty zůstávají v historii)">🗑</button>
        </span>
      </div>
      <div className="text-amber-200/70">
        {beats.length === 0 ? 'zatím bez beatů' : beats.map((b, i) => <span key={i}>{i > 0 && ' → '}{i + 1}. {b}</span>)}
      </div>
    </div>
  )
}
const BEAT_LABEL: Record<BeatKind, string> = { escalation: 'eskalace', consequence: 'následek', resolution: 'rozuzlení', reveal: 'odhalení / zvrat' }
const STAKES_LABEL: Record<Stakes, string> = { low: 'nízké', medium: 'střední', high: 'vysoké' }
const OUTCOME_LABEL: Record<RollOutcome, string> = { success: 'úspěch', partial: 'částečný úspěch', fail: 'neúspěch' }

const selectClass = `${inputClass} py-0.5 text-xs`
const btn = 'px-3 py-1 rounded-md border transition-colors disabled:opacity-50'

function PulseStrip({ pulse, onOverride, disabled }: { pulse: CampaignPulse; onOverride: (o: PulseOverride) => void; disabled: boolean }) {
  const [why, setWhy] = useState(false)
  const override: PulseOverride = { tension: pulse.overridden.tension ? pulse.tension : null, phase: pulse.overridden.phase ? pulse.phase : null }
  return (
    <div className="flex flex-col gap-1 text-xs text-amber-100/90">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-amber-200">Puls kampaně</span>
        <label className="flex items-center gap-1" title="Napětí 0–10; „auto“ = dopočítané z nití, hodin, questů a posledních beatů">
          napětí
          <select value={override.tension ?? 'auto'} onChange={e => onOverride({ ...override, tension: e.target.value === 'auto' ? null : Number(e.target.value) })} disabled={disabled} className={selectClass}>
            <option value="auto">auto ({pulse.overridden.tension ? '?' : pulse.tension})</option>
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i}>{i}{pulse.overridden.tension && pulse.tension === i ? ' ✎' : ''}</option>
            ))}
          </select>
          <span className="inline-block w-24 h-1.5 rounded bg-amber-900/60 overflow-hidden" aria-hidden>
            <span className="block h-full bg-amber-400" style={{ width: `${pulse.tension * 10}%` }} />
          </span>
        </label>
        <label className="flex items-center gap-1" title="Fáze pacingu; „auto“ = podle napětí a posledního beatu">
          fáze
          <select value={override.phase ?? 'auto'} onChange={e => onOverride({ ...override, phase: e.target.value === 'auto' ? null : (e.target.value as PacingPhase) })} disabled={disabled} className={selectClass}>
            <option value="auto">auto ({pulse.overridden.phase ? '?' : PHASE_LABEL[pulse.phase]})</option>
            {(Object.keys(PHASE_LABEL) as PacingPhase[]).map(p => (
              <option key={p} value={p}>{PHASE_LABEL[p]}{pulse.overridden.phase && pulse.phase === p ? ' ✎' : ''}</option>
            ))}
          </select>
        </label>
        <span title="Otevřené nitě (z toho eskalované) · otevřené questy">nitě {pulse.openThreads}{pulse.escalatedThreads ? ` (${pulse.escalatedThreads}⚡)` : ''} · questy {pulse.openQuests}</span>
        {pulse.consequenceDebt > 0 && <span className="text-red-300" title="Neúspěchy bez odezvy – další beat bude následek">dluh následků {pulse.consequenceDebt}</span>}
        <span title="Přijaté beaty od posledního zvratu">od zvratu {pulse.beatsSinceTwist}</span>
        <button type="button" onClick={() => setWhy(v => !v)} className="text-amber-200/70 hover:text-amber-100 underline-offset-2 hover:underline">proč?</button>
      </div>
      {why && (
        <ul className="list-disc pl-5 text-amber-200/80">
          {pulse.signals.map(s => <li key={s}>{s}</li>)}
        </ul>
      )}
    </div>
  )
}

/**
 * Režie Directoru nad vstupním polem: puls kampaně (s ruční korekcí) a brief – co se má v dalším beatu stát.
 * Hráč může přehodit (nový seed), upravit hodnoty, zadat výsledek hodu, přeskočit režii, a teprve pak nechá AI psát.
 */
export default function DirectorPanel({ state, busy, aiBusy, suggestionPending, canWrite, threadOptions, questOptions, onCreate, onPatch, onSkip, onWrite, onClose, onPulseOverride, onResolveEvent, onAbandonEvent, darken }: DirectorPanelProps) {
  const brief = state.brief
  const event = state.event
  const locked = busy || aiBusy || suggestionPending
  /** Brief je beatem probíhající události – typ, podoba a sázky se dědí */
  const inEvent = !!brief && !!event && brief.eventId === event.id
  /** Hráč hodil / dobojoval, ale výsledek ještě nezadal – AI nemá co psát */
  const awaitingOutcome = !!brief && brief.rollPhase === 'after' && brief.outcome === null
  const [notes, setNotes] = useState(brief?.notes ?? '')

  const focusOptions = (options: string[], current: string | null) => (current && !options.includes(current) ? [current, ...options] : options)

  return (
    <div className={`flex-shrink-0 mx-4 mb-2 rounded-lg border border-amber-500 text-sm text-amber-50 ${darken ? 'bg-amber-950/90' : 'bg-amber-950/80'} max-h-[45vh] flex flex-col`}>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-amber-500/40">
        <span className="font-semibold">🎬 Režie</span>
        {brief && (
          <span className="text-amber-200/70 text-xs" title={`seed ${brief.seed}`}>
            {suggestionPending ? 'návrh AI podle této režie čeká na přijetí' : aiBusy ? 'AI píše podle této režie…' : 'uprav nebo přehoď, pak nech AI psát'}
          </span>
        )}
        <button type="button" onClick={onClose} disabled={aiBusy} className="ml-auto text-amber-200/70 hover:text-amber-100" title="Skrýt panel (brief zůstává)">✕</button>
      </div>

      <div className="px-4 py-2 border-b border-amber-500/40">
        <PulseStrip pulse={state.pulse} onOverride={onPulseOverride} disabled={busy || aiBusy} />
      </div>
      {event && (
        <div className="px-4 py-2 border-b border-amber-500/40 bg-amber-900/30">
          <EventStrip event={event} locked={locked} onResolve={onResolveEvent} onAbandon={onAbandonEvent} />
        </div>
      )}

      <div className="overflow-y-auto px-4 py-2 flex flex-col gap-2">
        {!brief ? (
          <div className="flex flex-wrap items-center gap-2 text-amber-100/80">
            <span>{event ? 'Žádný brief – nech Director připravit další beat události.' : 'Žádný brief – nech Director rozhodnout, co se má v dalším beatu stát.'}</span>
            <button type="button" onClick={() => onCreate()} disabled={busy || aiBusy} className={`${btn} border-amber-300/70 bg-amber-800/50 hover:bg-amber-700/60`}>🎲 Vytvořit režii</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-xs">
              <span className="text-amber-200/80">Režim</span>
              <div className="flex flex-wrap gap-2 items-center">
                {inEvent ? (
                  <span title="Beat uvnitř probíhající události – typ, podoba a sázky se dědí z události">
                    ⚡ {event.beats.length + 1}. beat události · {EVENT_LABEL[event.eventType]}{event.obstacleKind ? ` – ${OBSTACLE_LABEL[event.obstacleKind]}` : ''}
                  </span>
                ) : (
                  <>
                <select value={brief.mode} onChange={e => onPatch({ mode: e.target.value as BriefPatch['mode'] })} disabled={locked} className={selectClass}>
                  <option value="continue">pokračování (bez nové události)</option>
                  <option value="event">nová událost</option>
                </select>
                {brief.mode === 'event' && (
                  <select value={brief.eventType ?? 'neutral'} onChange={e => onPatch({ eventType: e.target.value as EventType })} disabled={locked} className={selectClass}>
                    {(Object.keys(EVENT_LABEL) as EventType[]).map(t => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
                  </select>
                )}
                {brief.mode === 'event' && brief.eventType === 'obstacle' && (
                  <select value={brief.obstacleKind ?? 'check'} onChange={e => onPatch({ obstacleKind: e.target.value as ObstacleKind })} disabled={locked} className={selectClass} title="Podoba překážky; střet/boj a dilema se neřeší jedním hodem – AI se zastaví a řešení je na hráči">
                    {(Object.keys(OBSTACLE_LABEL) as ObstacleKind[]).map(k => <option key={k} value={k}>{OBSTACLE_LABEL[k]}</option>)}
                  </select>
                )}
                  </>
                )}
              </div>

              <span className="text-amber-200/80">Funkce</span>
              <div className="flex flex-wrap gap-2 items-center">
                <select value={brief.beatKind} onChange={e => onPatch({ beatKind: e.target.value as BeatKind, twist: e.target.value === 'reveal' ? brief.twist : false })} disabled={locked} className={selectClass}>
                  {(Object.keys(BEAT_LABEL) as BeatKind[]).map(k => <option key={k} value={k}>{BEAT_LABEL[k]}</option>)}
                </select>
                <label className="flex items-center gap-1 cursor-pointer" title="Významný zvrat – odhalení, zrada, nová skutečnost">
                  <input type="checkbox" checked={brief.twist} onChange={e => onPatch({ twist: e.target.checked })} disabled={locked} className="accent-amber-400" />
                  zvrat
                </label>
                <span className="text-amber-200/80">sázky</span>
                <select value={brief.stakes} onChange={e => onPatch({ stakes: e.target.value as Stakes })} disabled={locked} className={selectClass}>
                  {(Object.keys(STAKES_LABEL) as Stakes[]).map(s => <option key={s} value={s}>{STAKES_LABEL[s]}</option>)}
                </select>
              </div>

              <span className="text-amber-200/80">Hod</span>
              <div className="flex flex-wrap gap-2 items-center">
                {brief.rollPhase === 'after' ? (
                  <>
                    <span className={awaitingOutcome ? 'font-semibold text-amber-200' : 'text-amber-200/80'}>
                      {brief.obstacleKind === 'encounter' ? 'střet je odehraný – jak dopadl?' : `hodil jsi na obtížnost ${brief.difficulty}/5${brief.difficultyLabel ? ` (${brief.difficultyLabel})` : ''} – jak to dopadlo?`}
                    </span>
                    <select value={brief.outcome ?? 'pending'} onChange={e => onPatch({ outcome: e.target.value === 'pending' ? null : (e.target.value as RollOutcome) })} disabled={locked} className={selectClass} title="Zadej výsledek podle svých pravidel; AI pak popíše dopad">
                      <option value="pending">zadej výsledek…</option>
                      {(Object.keys(OUTCOME_LABEL) as RollOutcome[]).map(o => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                    </select>
                  </>
                ) : brief.obstacleKind !== null && NO_ROLL_OBSTACLE.has(brief.obstacleKind) ? (
                  <span className="text-amber-200/80" title="AI se zastaví před prvním střetem / před volbou – řešení je na hráči podle jeho pravidel">
                    {brief.obstacleKind === 'encounter' ? 'bez jednoho hodu – AI zastaví před střetem, výsledek boje zadáš v dalším beatu' : 'bez hodu – jde o volbu hráče'}
                  </span>
                ) : (
                  <>
                    <select value={brief.difficulty ?? 'none'} onChange={e => onPatch({ difficulty: e.target.value === 'none' ? null : Number(e.target.value) })} disabled={locked} className={selectClass}>
                      <option value="none">bez hodu</option>
                      {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>obtížnost {d}/5</option>)}
                    </select>
                    {brief.difficulty !== null && (
                      <>
                        {brief.difficultyLabel && <span className="font-semibold text-amber-200">{brief.difficultyLabel}</span>}
                        <span className="text-amber-200/80">výsledek</span>
                        <select value={brief.outcome ?? 'pending'} onChange={e => onPatch({ outcome: e.target.value === 'pending' ? null : (e.target.value as RollOutcome) })} disabled={locked} className={selectClass} title="Bez výsledku AI dovede scénu k hodu a zastaví se (hodíš pak a výsledek zadáš v dalším beatu); se zadaným výsledkem AI rovnou popíše dopad">
                          <option value="pending">ještě jsem neházel – AI zastaví před hodem</option>
                          {(Object.keys(OUTCOME_LABEL) as RollOutcome[]).map(o => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                        </select>
                      </>
                    )}
                    {brief.outcome && brief.difficulty === null && inEvent && brief.beatKind === 'resolution' && (
                      <span className="text-amber-200/80">celkový výsledek události: <span className="font-semibold text-amber-200">{OUTCOME_LABEL[brief.outcome]}</span></span>
                    )}
                  </>
                )}
              </div>

              <span className="text-amber-200/80">Týká se</span>
              <div className="flex flex-wrap gap-2 items-center">
                {brief.focus.characters.length > 0 && <span>{brief.focus.characters.join(', ')}</span>}
                {brief.focus.location && <span className="text-amber-200/80">📍 {brief.focus.location}</span>}
                <select value={brief.focus.thread ?? ''} onChange={e => onPatch({ focus: { thread: e.target.value || null } })} disabled={locked} className={selectClass} title="Nit, ze které beat čerpá">
                  <option value="">(bez nitě)</option>
                  {focusOptions(threadOptions, brief.focus.thread).map(t => <option key={t} value={t}>🧵 {t}</option>)}
                </select>
                <select value={brief.focus.quest ?? ''} onChange={e => onPatch({ focus: { quest: e.target.value || null } })} disabled={locked} className={selectClass} title="Quest, ze kterého beat čerpá">
                  <option value="">(bez questu)</option>
                  {focusOptions(questOptions, brief.focus.quest).map(q => <option key={q} value={q}>🎯 {q}</option>)}
                </select>
                {brief.focus.faction && <span className="text-amber-200/80">🏛 {brief.focus.faction}</span>}
              </div>

              <span className="text-amber-200/80">Pokyn</span>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={() => { if (notes !== brief.notes) onPatch({ notes }) }}
                disabled={locked}
                placeholder="Volitelně pro AI: např. „ať se objeví ten dopis“"
                className={`${inputClass} py-0.5 text-xs`}
              />
            </div>
          </>
        )}
      </div>

      {brief && (
        <div className="px-4 py-2 border-t border-amber-500/40 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onWrite} disabled={locked || !canWrite || awaitingOutcome} className={`${btn} border-emerald-400 bg-emerald-700/50 hover:bg-emerald-600/60`} title={awaitingOutcome ? 'Nejdřív zadej výsledek hodu / střetu' : canWrite ? 'Nechat AI napsat pokračování podle této režie' : 'Scéna nemá zapnutou AI nebo hra nemá vypravěče'}>
            ✍️ Nechat AI psát
          </button>
          <button type="button" onClick={() => onCreate()} disabled={locked} className={`${btn} border-amber-300/60 hover:border-amber-200`} title="Nový brief s jiným seedem">
            🎲 Přehodit
          </button>
          <button type="button" onClick={onSkip} disabled={locked} className={`${btn} border-amber-300/40 hover:border-amber-200 ml-auto`} title="Zahodit režii – AI napíše pokračování bez briefu">
            ⏭ Přeskočit režii
          </button>
        </div>
      )}
    </div>
  )
}
