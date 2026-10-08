import type { BriefPatch, CampaignPulse, DirectorState, NarrativeBrief } from '@solo-rpg/shared'
import { NotFoundError, type StorageProvider } from '../vault/StorageProvider.js'
import { applyBriefPatch, buildBrief } from './briefBuilder.js'
import { describeBrief } from './briefPrompt.js'
import { beatFromPayload, computePulse, type BeatRecord } from './pulse.js'
import { randomSeed } from './rng.js'

/** Druh události v `events`, ze které se rekonstruuje historie beatů (puls) */
export const BEAT_ACCEPTED_EVENT = 'director.beat.accepted'
export const BRIEF_CREATED_EVENT = 'director.brief.created'

/** Kolik posledních beatů se čte pro puls */
const BEAT_HISTORY = 50

/**
 * Director v1 (docs/ARCHITECTURE_V2.md §4.1): drží rozpracovaný `NarrativeBrief` per scéna (in‑memory jako návrhy AI),
 * dopočítává `CampaignPulse` a při přijetí návrhu, který podle briefu vznikl, zapíše beat do `events` – z nich se
 * puls příště skládá (dluh následků, beaty od zvratu).
 */
export class DirectorService {
  private readonly briefs = new Map<string, NarrativeBrief>()

  constructor(private readonly storage: StorageProvider) {}

  private key(game: string, sceneId: string): string {
    return `${game.toLocaleLowerCase('cs')}::${sceneId}`
  }

  private async beats(game: string): Promise<BeatRecord[]> {
    const events = await this.storage.listEvents(game, { kinds: [BEAT_ACCEPTED_EVENT], limit: BEAT_HISTORY })
    return events.map(e => beatFromPayload(e.payload, e.createdAt)).filter((b): b is BeatRecord => b !== null)
  }

  async pulse(game: string): Promise<CampaignPulse> {
    const detail = await this.storage.getGame(game)
    if (!detail) throw new NotFoundError(`Hra „${game}“ neexistuje.`)
    return computePulse(detail, await this.beats(game), detail.setup.pulseOverride)
  }

  /** Rozpracovaný brief scény (bez dotazu do DB) */
  pending(game: string, sceneId: string): NarrativeBrief | null {
    return this.briefs.get(this.key(game, sceneId)) ?? null
  }

  async get(game: string, sceneId: string): Promise<DirectorState> {
    return { pulse: await this.pulse(game), brief: this.pending(game, sceneId) }
  }

  /** Nový brief (nahradí případný rozpracovaný); bez seedu = náhodný („přehodit“) */
  async create(game: string, sceneId: string, seed?: number): Promise<NarrativeBrief> {
    const detail = await this.storage.getGame(game)
    if (!detail) throw new NotFoundError(`Hra „${game}“ neexistuje.`)
    const scene = detail.scenes.find(s => s.id === sceneId)
    if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    const pulse = computePulse(detail, await this.beats(game), detail.setup.pulseOverride)
    const brief = buildBrief({ detail, scene, pulse, seed: seed ?? randomSeed(), rulesSystem: detail.setup.rulesSystem })
    this.briefs.set(this.key(game, sceneId), brief)
    await this.storage.appendEvent(game, { sceneId, kind: BRIEF_CREATED_EVENT, payload: { briefId: brief.id, seed: brief.seed, summary: describeBrief(brief), pulse } })
    return brief
  }

  async patch(game: string, sceneId: string, patch: BriefPatch): Promise<NarrativeBrief> {
    const current = this.pending(game, sceneId)
    if (!current) throw new NotFoundError('Scéna nemá rozpracovaný brief – nech si vygenerovat nový.')
    const detail = await this.storage.getGame(game)
    if (!detail) throw new NotFoundError(`Hra „${game}“ neexistuje.`)
    const next = applyBriefPatch(current, patch, detail.setup.rulesSystem)
    this.briefs.set(this.key(game, sceneId), next)
    return next
  }

  /** Přeskočit režii – scéna se bude psát bez briefu */
  clear(game: string, sceneId: string): void {
    this.briefs.delete(this.key(game, sceneId))
  }

  /** Návrh podle briefu byl přijat → beat je kánon: zapsat do `events` a brief uvolnit */
  async consume(game: string, sceneId: string, briefId: string, suggestionId: string): Promise<void> {
    const brief = this.pending(game, sceneId)
    if (!brief || brief.id !== briefId) return
    await this.storage.appendEvent(game, { sceneId, kind: BEAT_ACCEPTED_EVENT, payload: { suggestionId, brief, summary: describeBrief(brief) } })
    this.clear(game, sceneId)
  }
}
