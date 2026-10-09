import type { BeatKind, EventType, GameDetail, NarrativeBrief, ObstacleKind, RollOutcome, Stakes } from '@solo-rpg/shared'

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

export function buildBriefSection(brief: NarrativeBrief, detail: GameDetail): string {
  const lines: string[] = ['## Režie (závazné zadání pro tento beat)']
  if (brief.mode === 'continue') {
    lines.push(`- Režim: POKRAČOVÁNÍ – nevnášej novou událost, rozvíjej rozehranou situaci a reakce postav; dramatická funkce: ${BEAT_KIND[brief.beatKind]}.`)
  } else {
    lines.push(`- Režim: NOVÁ UDÁLOST – ${EVENT_TYPE[brief.eventType ?? 'neutral']}.`)
    if (brief.eventType === 'obstacle' && brief.obstacleKind) lines.push(`- Podoba překážky: ${OBSTACLE_KIND[brief.obstacleKind]}.`)
    lines.push(`- Dramatická funkce: ${BEAT_KIND[brief.beatKind]}.`)
  }
  if (brief.twist) lines.push('- Tento beat obsahuje ZVRAT – odhalení musí být konkrétní a vycházet z toho, co už ve světě existuje (nitě, tajemství, vztahy).')
  lines.push(`- Sázky: ${STAKES[brief.stakes]}.`)

  if (brief.difficulty !== null) {
    const label = brief.difficultyLabel ? ` = ${brief.difficultyLabel}` : ''
    if (brief.outcome) {
      lines.push(`- Hod: hráč už hodil na obtížnost ${brief.difficulty}/5${label}. Výsledek: ${OUTCOME[brief.outcome]}. Výsledek NEMĚŇ a neházej znovu.`)
    } else {
      lines.push(
        `- Hod: situace vyžaduje hod hráče na obtížnost ${brief.difficulty}/5${label}. Doveď scénu k okamžiku hodu a ZASTAV SE – výsledek neurčuj, nepopisuj, co se stalo po hodu. Obtížnost neměň.`,
      )
    }
  } else if (brief.obstacleKind === 'encounter') {
    lines.push('- Hod: žádný jednotlivý hod – střet rozehraje hráč podle svých pravidel po tvém textu.')
  } else if (brief.obstacleKind === 'dilemma') {
    lines.push('- Hod: žádný – jde o volbu hráče, ne o zkoušku.')
  } else {
    lines.push('- Hod: tento beat nevyžaduje hod – žádné zkoušky dovedností nevyvolávej.')
  }

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

/** Krátký popisek briefu do logu / payloadu události */
export function describeBrief(brief: NarrativeBrief): string {
  const parts = [brief.mode === 'continue' ? 'pokračování' : `událost:${brief.eventType}${brief.obstacleKind ? `/${brief.obstacleKind}` : ''}`, brief.beatKind]
  if (brief.twist) parts.push('zvrat')
  if (brief.difficulty !== null) parts.push(`obtížnost ${brief.difficulty}${brief.outcome ? `→${brief.outcome}` : ''}`)
  parts.push(`sázky ${brief.stakes}`)
  return parts.join(', ')
}
