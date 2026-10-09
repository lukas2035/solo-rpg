import type { BeatKind, DirectorEvent, EventType, GameDetail, NarrativeBrief, ObstacleKind, RollOutcome, Stakes } from '@solo-rpg/shared'

/**
 * Převod `NarrativeBrief` na sekci promptu „Režie“. AI dostane *co* se má stát (typ, obtížnost, stakes, koho se to
 * týká, výsledek hodu), ne tabulky ani pravděpodobnosti – a nesmí to měnit (docs/ARCHITECTURE_V2.md §4.2).
 */

const EVENT_TYPE: Record<EventType, string> = {
  obstacle: 'PŘEKÁŽKA – do cesty postavám se postaví konkrétní problém (osoba, okolnost, nebezpečí), který musí řešit teď',
  neutral: 'NEUTRÁLNÍ UDÁLOST – něco nového se stane nebo objeví, bez okamžité hrozby ani zisku; mění situaci nebo informace',
  opportunity: 'PŘÍLEŽITOST – otevře se šance něco získat, někoho přesvědčit, někam se dostat; využití stojí riziko nebo cenu',
  reward: 'ODMĚNA – postavy něco získají (informace, spojence, věc, úlevu) jako plod dřívějšího úsilí',
}

const OBSTACLE_KIND: Record<ObstacleKind, string> = {
  check: 'ZKOUŠKA DOVEDNOSTI – překážku lze překonat jedním umem postavy (šplh, zámek, stopování, pátrání…)',
  social: 'SOCIÁLNÍ STŘET – někdo konkrétní stojí proti postavám vůlí, ne zbraní (přesvědčování, vyjednávání, zastrašení, výslech, lež)',
  encounter: 'STŘET / BOJ – objeví se konkrétní protivník nebo hrozba, se kterou se postavy musí utkat nebo jí uniknout. Uveď, kdo/co to je, kolik jich je, co chtějí a jak střet začíná. Boj se řeší podle pravidel hráče, ne jedním hodem: ZASTAV SE před první výměnou úderů; nepopisuj průběh ani výsledek boje',
  hazard: 'NEBEZPEČÍ PROSTŘEDÍ – past, požár, zřícení, pronásledování, bouře, jed; hrozba bez vůle, které je třeba uniknout nebo ji zvládnout',
  dilemma: 'DILEMA – postavy musí volit mezi dvěma cestami a každá něco stojí (koho zachránit, komu věřit, co obětovat). Nabídni volbu jasně a ZASTAV SE – rozhodnutí je na hráči, žádný hod',
}

const BEAT_KIND: Record<BeatKind, string> = {
  escalation: 'eskalace – přitvrď, zvyš tlak nebo sázky u vybrané nitě/questu',
  consequence: 'následek – projeví se dopad dřívějšího neúspěchu nebo rozhodnutí postav; svět reaguje',
  resolution: 'rozuzlení – něco se uzavře nebo vyjasní (dílčí cíl, konflikt, otázka)',
  reveal: 'odhalení / ZVRAT – vyjde najevo významná nová skutečnost (zrada, tajemství, skrytý motiv), která mění pohled na situaci',
}

const STAKES: Record<Stakes, string> = {
  low: 'nízké (nepohodlí, zdržení, drobná ztráta)',
  medium: 'střední (vážná ztráta, zranění, poškozený vztah, ztracená stopa)',
  high: 'vysoké (život, svoboda, klíčový vztah nebo cíl questu)',
}

const OUTCOME: Record<RollOutcome, string> = {
  success: 'ÚSPĚCH – postava uspěla; popiš, co získala, bez dodatečné daně',
  partial: 'ČÁSTEČNÝ ÚSPĚCH – postava uspěla, ale za cenu (komplikace, ztráta, nový problém)',
  fail: 'NEÚSPĚCH – postava neuspěla; situace se zhorší nebo posune nečekaným směrem (ne „nic se nestalo“)',
}

const withId = (name: string, id: string | undefined) => (id ? `${name} (id: ${id})` : name)

export function buildBriefSection(brief: NarrativeBrief, detail: GameDetail, event: DirectorEvent | null = null): string {
  const lines: string[] = ['## Režie (závazné zadání pro tento beat)']
  const inEvent = event !== null && brief.eventId === event.id
  if (brief.mode === 'continue') {
    lines.push(`- Režim: POKRAČOVÁNÍ – nevnášej novou událost, rozvíjej rozehranou situaci a reakce postav; dramatická funkce: ${BEAT_KIND[brief.beatKind]}.`)
  } else if (inEvent) {
    lines.push(`- Režim: PROBÍHAJÍCÍ UDÁLOST (${event.beats.length + 1}. beat) – ${EVENT_TYPE[brief.eventType ?? 'neutral']}. Nezačínej novou událost, pokračuj v této.`)
    if (brief.eventType === 'obstacle' && brief.obstacleKind) lines.push(`- Podoba překážky: ${OBSTACLE_KIND[brief.obstacleKind]}.`)
    lines.push(`- Dosavadní průběh: ${describeEventBeats(event)}.`)
    lines.push(`- Dramatická funkce tohoto beatu: ${BEAT_KIND[brief.beatKind]}${brief.beatKind === 'resolution' ? ' – událost tímto beatem KONČÍ, uzavři ji' : ''}.`)
  } else {
    lines.push(`- Režim: NOVÁ UDÁLOST – ${EVENT_TYPE[brief.eventType ?? 'neutral']}.`)
    if (brief.eventType === 'obstacle' && brief.obstacleKind) lines.push(`- Podoba překážky: ${OBSTACLE_KIND[brief.obstacleKind]}.`)
    lines.push(`- Dramatická funkce: ${BEAT_KIND[brief.beatKind]}.`)
  }
  if (brief.twist) lines.push('- Tento beat obsahuje ZVRAT – odhalení musí být konkrétní a vycházet z toho, co už ve světě existuje (nitě, tajemství, vztahy).')
  lines.push(`- Sázky: ${STAKES[brief.stakes]}.`)

  lines.push(`- ${describeRoll(brief)}`)

  const focus: string[] = []
  const chars = brief.focus.characters.map(n => withId(n, detail.setup.characters.find(c => c.name === n)?.id))
  if (chars.length) focus.push(`postavy: ${chars.join(', ')}`)
  if (brief.focus.thread) focus.push(`nit: ${withId(brief.focus.thread, detail.threads.find(t => t.title === brief.focus.thread)?.id)}`)
  if (brief.focus.quest) focus.push(`quest: ${withId(brief.focus.quest, detail.quests.find(q => q.title === brief.focus.quest)?.id)}`)
  if (brief.focus.faction) focus.push(`frakce: ${withId(brief.focus.faction, detail.factions.find(f => f.title === brief.focus.faction)?.id)}`)
  if (brief.focus.location) focus.push(`lokace: ${withId(brief.focus.location, detail.locations.find(l => l.title === brief.focus.location)?.id)}`)
  if (focus.length) lines.push(`- Týká se: ${focus.join('; ')}. Nit/quest využij jako zdroj obsahu beatu, nevymýšlej nesouvisející.`)

  if (brief.notes.trim()) lines.push(`- Pokyn hráče: ${brief.notes.trim()}`)

  lines.push('- Neurčuj pravděpodobnosti, obtížnosti ani výsledky hodů nad rámec výše uvedeného; tyto hodnoty stanovila hra.')
  return lines.join('\n')
}

/** Řádek „Hod“ podle fáze: před hodem/střetem zastavit, po hodu popsat dopad zadaného výsledku, jinak bez hodu */
function describeRoll(brief: NarrativeBrief): string {
  const label = brief.difficultyLabel ? ` = ${brief.difficultyLabel}` : ''
  const fight = brief.obstacleKind === 'encounter'
  if (brief.rollPhase === 'after') {
    if (!brief.outcome) return 'Hod: hráč hodil, ale výsledek ještě nezadal – NEPIŠ, dokud ho nezadá.'
    const what = fight ? 'Střet už hráč odehrál podle svých pravidel' : `Hráč už hodil na obtížnost ${brief.difficulty ?? '?'}/5${label}`
    return `Hod: ${what}. Výsledek: ${OUTCOME[brief.outcome]}. Popiš dopad a reakce – výsledek NEMĚŇ, neházej znovu, nezačínej další střet.`
  }
  if (brief.rollPhase === 'before') {
    if (fight) return 'Hod: žádný jednotlivý hod – doveď scénu k prvnímu střetu a ZASTAV SE; boj rozehraje hráč podle svých pravidel a jeho výsledek přijde v dalším beatu.'
    return `Hod: situace vyžaduje hod hráče na obtížnost ${brief.difficulty}/5${label}. Doveď scénu k okamžiku hodu a ZASTAV SE – výsledek neurčuj, nepopisuj, co se stalo po hodu. Obtížnost neměň.`
  }
  if (brief.outcome) return `Hod: žádný další; celkový výsledek události: ${OUTCOME[brief.outcome]}. Z něj vycházej, neměň ho.`
  if (brief.obstacleKind === 'dilemma') return 'Hod: žádný – jde o volbu hráče, ne o zkoušku.'
  return 'Hod: tento beat nevyžaduje hod – žádné zkoušky dovedností nevyvolávej.'
}

/** Krátký souhrn dosavadních beatů události pro prompt */
function describeEventBeats(event: DirectorEvent): string {
  if (event.beats.length === 0) return 'událost teprve začíná'
  return event.beats
    .map((b, i) => {
      const parts = [BEAT_KIND[b.beatKind].split(' – ')[0]!.toLowerCase()]
      if (b.rollPhase === 'before') parts.push('zastaveno před hodem/střetem')
      if (b.outcome) parts.push(`výsledek ${OUTCOME[b.outcome].split(' – ')[0]!.toLowerCase()}`)
      if (b.twist) parts.push('zvrat')
      return `${i + 1}. ${parts.join(', ')}`
    })
    .join('; ')
}

/** Krátký popisek briefu do logu / payloadu události */
export function describeBrief(brief: NarrativeBrief): string {
  const parts = [brief.mode === 'continue' ? 'pokračování' : `událost:${brief.eventType}${brief.obstacleKind ? `/${brief.obstacleKind}` : ''}`, brief.beatKind]
  if (brief.eventId) parts.push('v události')
  if (brief.twist) parts.push('zvrat')
  if (brief.difficulty !== null) parts.push(`obtížnost ${brief.difficulty}`)
  if (brief.rollPhase !== 'none') parts.push(brief.rollPhase === 'before' ? 'před hodem' : 'po hodu')
  if (brief.outcome) parts.push(`→${brief.outcome}`)
  parts.push(`sázky ${brief.stakes}`)
  return parts.join(', ')
}
