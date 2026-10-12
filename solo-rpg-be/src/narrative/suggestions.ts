import type { AiSuggestion, AiSuggestionState, StoryEntry } from '@solo-rpg/shared'
import type { FastifyBaseLogger as Logger } from 'fastify'
import { draftSceneReply } from '../ai/sceneAi.js'
import type { Config } from '../config.js'
import type { DirectorService } from '../director/directorService.js'
import { newId } from '../storage/ids.js'
import { NotFoundError, ValidationError, type StorageProvider } from '../vault/StorageProvider.js'

/**
 * Smyčka Suggestion → Accept / Reject (docs/ARCHITECTURE_V2.md §4.2).
 *
 * AI nikdy nezapisuje přímo: `generate` vrátí návrh, `accept` ho (případně hráčem upravený) připíše do scény,
 * `reject` s důvodem ho zahodí a důvod jde do dalšího pokusu. Rozpracovaný stav per scéna je v paměti procesu
 * (po restartu BE návrh zmizí – hráč si vygeneruje nový); každý accept/reject se zapíše do `events`.
 */

/** Kolik posledních důvodů odmítnutí se posílá modelu */
const MAX_REASONS = 5

interface SceneState {
  pending: AiSuggestion | null
  rejectedReasons: string[]
}

export class SuggestionService {
  private readonly scenes = new Map<string, SceneState>()

  constructor(
    private readonly storage: StorageProvider,
    private readonly config: Config,
    /** Director: rozpracovaný brief scény jde do promptu a při přijetí návrhu se stane beatem */
    private readonly director?: DirectorService,
  ) {}

  private key(game: string, sceneId: string): string {
    return `${game.toLocaleLowerCase('cs')}::${sceneId}`
  }

  private state(game: string, sceneId: string): SceneState {
    const k = this.key(game, sceneId)
    let s = this.scenes.get(k)
    if (!s) {
      s = { pending: null, rejectedReasons: [] }
      this.scenes.set(k, s)
    }
    return s
  }

  /** Rozpracovaný návrh a nasbírané důvody odmítnutí pro scénu (FE si ho načte při přepnutí scény) */
  get(game: string, sceneId: string): AiSuggestionState {
    const s = this.scenes.get(this.key(game, sceneId))
    return { suggestion: s?.pending ?? null, rejectedReasons: s?.rejectedReasons ?? [] }
  }

  /** Vygeneruje nový návrh; případný dřívější nepřijatý návrh scény nahradí (bez záznamu důvodu). `prompt` = jednorázový pokyn hráče */
  async generate(game: string, sceneId: string, log?: Logger, prompt = ''): Promise<AiSuggestion> {
    const s = this.state(game, sceneId)
    const brief = (await this.director?.pending(game, sceneId)) ?? null
    if (brief && brief.rollPhase === 'after' && !brief.outcome) throw new ValidationError('Nejdřív v režii zadej výsledek hodu / střetu – AI pak popíše dopad.')
    const userPrompt = prompt.trim()
    const draft = await draftSceneReply(this.storage, this.config, game, sceneId, s.rejectedReasons, log, brief, userPrompt)
    // Prompt jako záznam scény – zapíše se až s přijetím první repliky (viz `accept`); repliky na něj odkazují přes `promptId`
    const now = Date.now()
    const promptEntry: StoryEntry | null = userPrompt
      ? { id: `${now - 1}`, characterName: null, narratorName: null, text: userPrompt, timestamp: now - 1, kind: 'prompt', markdown: userPrompt.includes('\n') || undefined }
      : null
    const suggestion: AiSuggestion = {
      id: newId('suggestion'),
      sceneId,
      entries: draft.entries.map(e => ({ ...e, ai: true, promptId: promptEntry?.id ?? null })),
      raw: draft.raw,
      rejectedReasons: [...s.rejectedReasons],
      contextIncluded: draft.context.included,
      briefId: brief?.id ?? null,
      promptEntry,
      createdAt: now,
    }
    s.pending = suggestion
    await this.storage.appendEvent(game, {
      sceneId,
      kind: 'ai.suggestion.created',
      payload: { suggestionId: suggestion.id, briefId: suggestion.briefId, prompt: userPrompt || null, entries: suggestion.entries.length, rejectedReasons: suggestion.rejectedReasons, context: draft.context.included, contextTokens: draft.context.tokensUsed, contextDropped: draft.context.dropped },
    })
    return suggestion
  }

  private requirePending(game: string, sceneId: string, suggestionId: string): { state: SceneState; suggestion: AiSuggestion } {
    const state = this.state(game, sceneId)
    if (!state.pending || state.pending.id !== suggestionId) {
      throw new NotFoundError('Tento návrh AI už není aktuální – nech si vygenerovat nový.')
    }
    return { state, suggestion: state.pending }
  }

  /**
   * Přijme návrh: `entries` (hráčem upravené) připíše na konec scény. Celé přijetí vynuluje důvody odmítnutí a spotřebuje brief;
   * `partial` nechá zbylé (nepřijaté) repliky jako návrh k dalšímu hodnocení – vrací je jako `suggestion`.
   */
  async accept(game: string, sceneId: string, suggestionId: string, entries: StoryEntry[], partial = false): Promise<{ entries: StoryEntry[]; suggestion: AiSuggestion | null }> {
    const { state, suggestion } = this.requirePending(game, sceneId, suggestionId)
    // Scéna se mezitím mohla změnit (hráč psal) → připojit k aktuálnímu stavu
    const current = await this.storage.getSceneEntries(game, sceneId)
    if (!current) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
    const ids = new Set(current.map(e => e.id))
    const accepted = entries.filter(e => !ids.has(e.id)).map(e => ({ ...e, ai: true, promptId: suggestion.promptEntry?.id ?? e.promptId ?? null }))
    // S první přijatou replikou se do scény zapíše i prompt, podle kterého vznikla (těsně před ni)
    const promptToAdd = suggestion.promptEntry && accepted.length && !ids.has(suggestion.promptEntry.id) ? [suggestion.promptEntry] : []
    const toAdd = [...promptToAdd, ...accepted]
    if (toAdd.length) await this.storage.saveSceneEntries(game, sceneId, [...current, ...toAdd])
    const acceptedIds = new Set(entries.map(e => e.id))
    const remaining = partial ? suggestion.entries.filter(e => !acceptedIds.has(e.id)) : []
    const edited = JSON.stringify(accepted) !== JSON.stringify(partial ? suggestion.entries.filter(e => acceptedIds.has(e.id)) : suggestion.entries)
    await this.storage.appendEvent(game, {
      sceneId,
      kind: 'ai.suggestion.accepted',
      payload: { suggestionId, briefId: suggestion.briefId, promptId: suggestion.promptEntry?.id ?? null, raw: suggestion.raw, entries: accepted, edited, partial: remaining.length > 0, remaining: remaining.length, rejectedReasons: state.rejectedReasons },
    })
    if (remaining.length) {
      state.pending = { ...suggestion, entries: remaining }
      return { entries: toAdd, suggestion: state.pending }
    }
    if (suggestion.briefId) await this.director?.consume(game, sceneId, suggestion.briefId, suggestionId)
    state.pending = null
    state.rejectedReasons = []
    return { entries: toAdd, suggestion: null }
  }

  /** Odmítne návrh; neprázdný důvod se uloží a půjde do dalšího pokusu */
  async reject(game: string, sceneId: string, suggestionId: string, reason: string): Promise<AiSuggestionState> {
    const { state, suggestion } = this.requirePending(game, sceneId, suggestionId)
    const trimmed = reason.trim()
    if (trimmed) state.rejectedReasons = [...state.rejectedReasons, trimmed].slice(-MAX_REASONS)
    await this.storage.appendEvent(game, {
      sceneId,
      kind: 'ai.suggestion.rejected',
      payload: { suggestionId, raw: suggestion.raw, entries: suggestion.entries, reason: trimmed },
    })
    state.pending = null
    return this.get(game, sceneId)
  }

  /** Zahodí stav scény (např. při smazání scény) */
  forget(game: string, sceneId: string): void {
    this.scenes.delete(this.key(game, sceneId))
    void this.director?.clear(game, sceneId).catch(() => { /* scéna už neexistuje */ })
  }
}
