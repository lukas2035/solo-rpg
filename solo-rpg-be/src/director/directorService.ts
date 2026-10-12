import type { BriefPatch, CampaignPulse, DirectorEvent, DirectorState, NarrativeBrief, RollOutcome, SceneDirector } from '@solo-rpg/shared'
import { newId } from '../storage/ids.js'
import { NotFoundError, ValidationError, type StorageProvider } from '../vault/StorageProvider.js'
import { applyBriefPatch, buildBrief } from './briefBuilder.js'
import { describeBrief } from './briefPrompt.js'
import { beatFromPayload, computePulse, type BeatRecord } from './pulse.js'
import { randomSeed } from './rng.js'

/** Druh události v `events`, ze které se rekonstruuje historie beatů (puls) */
export const BEAT_ACCEPTED_EVENT = 'director.beat.accepted'
export const BRIEF_CREATED_EVENT = 'director.brief.created'
export const EVENT_STARTED_EVENT = 'director.event.started'
export const EVENT_RESOLVED_EVENT = 'director.event.resolved'
export const EVENT_ABANDONED_EVENT = 'director.event.abandoned'

/** Kolik posledních beatů se čte pro puls */
const BEAT_HISTORY = 50

const EMPTY: SceneDirector = { brief: null, event: null }

/**
 * Director v1 (docs/ARCHITECTURE_V2.md §4.1, §4.3): drží rozpracovaný `NarrativeBrief` a probíhající `DirectorEvent`
 * per scéna (uloženo u scény – přežije restart), dopočítává `CampaignPulse` a při přijetí návrhu, který podle briefu
 * vznikl, zapíše beat do `events` (z nich se puls příště skládá) a posune událost: první beat ji založí, rozuzlení uzavře.
 */
export class DirectorService {
  constructor(private readonly storage: StorageProvider) {}

  private async beats(game: string): Promise<BeatRecord[]> {
    const events = await this.storage.listEvents(game, { kinds: [BEAT_ACCEPTED_EVENT], limit: BEAT_HISTORY })
    return events.map(e => beatFromPayload(e.payload, e.createdAt)).filter((b): b is BeatRecord => b !== null)
  }

  private async load(game: string, sceneId: string): Promise<SceneDirector> {
    const stored = await this.storage.getSceneDirector(game, sceneId)
    if (!stored) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    return stored
  }

  /** Režie je dostupná jen scénám v pokročilém režimu AI */
  private async isAdvanced(game: string, sceneId: string): Promise<boolean> {
    const scenes = await this.storage.listScenes(game)
    return scenes.find(s => s.id === sceneId)?.aiMode === 'advanced'
  }

  async pulse(game: string): Promise<CampaignPulse> {
    const detail = await this.storage.getGame(game)
    if (!detail) throw new NotFoundError(`Hra „${game}“ neexistuje.`)
    return computePulse(detail, await this.beats(game), detail.setup.pulseOverride)
  }

  /** Rozpracovaný brief scény; null i pro neexistující scénu nebo scénu v základním režimu AI (brief se tam ignoruje) */
  async pending(game: string, sceneId: string): Promise<NarrativeBrief | null> {
    const brief = (await this.storage.getSceneDirector(game, sceneId))?.brief ?? null
    if (!brief) return null
    return (await this.isAdvanced(game, sceneId)) ? brief : null
  }

  async get(game: string, sceneId: string): Promise<DirectorState> {
    const [pulse, stored] = await Promise.all([this.pulse(game), this.load(game, sceneId)])
    return { pulse, brief: stored.brief, event: stored.event }
  }

  /**
   * Nový brief (nahradí případný rozpracovaný); bez seedu = náhodný („přehodit“). Má‑li scéna aktivní událost,
   * brief je jejím dalším beatem; `resolve` ji uzavře beatem rozuzlení s daným výsledkem.
   */
  async create(game: string, sceneId: string, seed?: number, resolve?: { outcome: RollOutcome | null }): Promise<NarrativeBrief> {
    const detail = await this.storage.getGame(game)
    if (!detail) throw new NotFoundError(`Hra „${game}“ neexistuje.`)
    const scene = detail.scenes.find(s => s.id === sceneId)
    if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    if (scene.aiMode !== 'advanced') throw new ValidationError('Scéna používá základní AI – režie je dostupná jen v pokročilém režimu (🤖 → nastavení AI).')
    const stored = await this.load(game, sceneId)
    if (resolve && !stored.event) throw new NotFoundError('Scéna nemá probíhající událost, kterou by šlo uzavřít.')
    const pulse = computePulse(detail, await this.beats(game), detail.setup.pulseOverride)
    const brief = buildBrief({ detail, scene, pulse, seed: seed ?? randomSeed(), rulesSystem: detail.setup.rulesSystem, event: stored.event, resolve })
    await this.storage.saveSceneDirector(game, sceneId, { ...stored, brief })
    await this.storage.appendEvent(game, { sceneId, kind: BRIEF_CREATED_EVENT, payload: { briefId: brief.id, eventId: brief.eventId, seed: brief.seed, summary: describeBrief(brief), pulse } })
    return brief
  }

  async patch(game: string, sceneId: string, patch: BriefPatch): Promise<NarrativeBrief> {
    const stored = await this.load(game, sceneId)
    if (!stored.brief) throw new NotFoundError('Scéna nemá rozpracovaný brief – nech si vygenerovat nový.')
    const detail = await this.storage.getGame(game)
    if (!detail) throw new NotFoundError(`Hra „${game}“ neexistuje.`)
    const next = applyBriefPatch(stored.brief, patch, detail.setup.rulesSystem)
    await this.storage.saveSceneDirector(game, sceneId, { ...stored, brief: next })
    return next
  }

  /** Přeskočit režii – scéna se bude psát bez briefu (událost zůstává) */
  async clear(game: string, sceneId: string): Promise<void> {
    const stored = await this.storage.getSceneDirector(game, sceneId)
    if (!stored?.brief) return
    await this.storage.saveSceneDirector(game, sceneId, { ...stored, brief: null })
  }

  /** Hráč událost zahodil bez rozuzlení (brief, který k ní patřil, také) */
  async abandonEvent(game: string, sceneId: string): Promise<DirectorState> {
    const stored = await this.load(game, sceneId)
    if (stored.event) {
      const brief = stored.brief?.eventId === stored.event.id ? null : stored.brief
      await this.storage.saveSceneDirector(game, sceneId, { brief, event: null })
      await this.storage.appendEvent(game, { sceneId, kind: EVENT_ABANDONED_EVENT, payload: { eventId: stored.event.id, beats: stored.event.beats.length } })
    }
    return this.get(game, sceneId)
  }

  /**
   * Návrh podle briefu byl přijat → beat je kánon: zapsat do `events`, brief uvolnit a posunout událost
   * (první beat nové události ji založí, pokud není jednorázová; rozuzlení uzavře)
   */
  async consume(game: string, sceneId: string, briefId: string, suggestionId: string): Promise<void> {
    const stored = (await this.storage.getSceneDirector(game, sceneId)) ?? EMPTY
    const brief = stored.brief
    if (!brief || brief.id !== briefId) return
    const now = Date.now()
    const beat = { briefId, suggestionId, beatKind: brief.beatKind, rollPhase: brief.rollPhase, difficulty: brief.difficulty, outcome: brief.outcome, twist: brief.twist, createdAt: now }
    let event: DirectorEvent | null = stored.event

    if (brief.mode === 'event') {
      if (event && brief.eventId === event.id) {
        event = { ...event, beats: [...event.beats, beat] }
      } else if (!event && (brief.beatKind !== 'resolution' || brief.rollPhase === 'before')) {
        // Rozuzlení bez hodu je jednorázová událost – nezakládá se
        event = {
          id: newId('event'),
          sceneId,
          eventType: brief.eventType ?? 'neutral',
          obstacleKind: brief.obstacleKind,
          stakes: brief.stakes,
          focus: brief.focus,
          status: 'active',
          beats: [beat],
          createdAt: now,
          resolvedAt: null,
        }
        await this.storage.appendEvent(game, { sceneId, kind: EVENT_STARTED_EVENT, payload: { eventId: event.id, eventType: event.eventType, obstacleKind: event.obstacleKind, stakes: event.stakes } })
      }
    }

    await this.storage.appendEvent(game, { sceneId, kind: BEAT_ACCEPTED_EVENT, payload: { suggestionId, brief, eventId: event?.id ?? null, summary: describeBrief(brief) } })

    // Rozuzlení uzavře událost; výjimkou je rozuzlení, které teprve vede k hodu (výsledek přijde dalším beatem)
    if (event && event.status === 'active' && brief.eventId === event.id && brief.beatKind === 'resolution' && brief.rollPhase !== 'before') {
      await this.storage.appendEvent(game, { sceneId, kind: EVENT_RESOLVED_EVENT, payload: { eventId: event.id, outcome: brief.outcome, beats: event.beats.length } })
      event = null
    }
    await this.storage.saveSceneDirector(game, sceneId, { brief: null, event })
  }
}
