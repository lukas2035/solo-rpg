import fs from 'node:fs/promises'
import type { NarrativeBrief, StoryEntry } from '@solo-rpg/shared'
import type { FastifyBaseLogger as Logger } from 'fastify'
import type { Config } from '../config.js'
import { buildBriefSection } from '../director/briefPrompt.js'
import type { StorageProvider } from '../vault/StorageProvider.js'
import { NotFoundError } from '../vault/StorageProvider.js'
import { buildSceneContext, type SceneContext } from '../narrative/contextBuilder.js'
import { AiError, PROVIDER_LABEL, chatCompletion, requireApiKey } from './provider.js'
import { buildMessages, parseAiReply, previousNarratorNames } from './scenePrompt.js'
import { buildRulesSection } from './rulesPrompt.js'

export interface SceneReplyDraft {
  entries: StoryEntry[]
  raw: string
  context: SceneContext
}

/**
 * Nechá aktuálního vypravěče hry navrhnout pokračování scény: sestaví prompt (postavy, scéna, kontext kampaně,
 * přepis), zavolá AI providera (OpenRouter / Mistral AI) a odpověď rozparsuje na záznamy.
 * **Nic neukládá** – o uložení rozhoduje hráč přes Suggestion → Accept (viz `narrative/suggestions.ts`).
 */
export async function draftSceneReply(
  storage: StorageProvider,
  config: Config,
  gameName: string,
  sceneId: string,
  rejectedReasons: string[] = [],
  log?: Logger,
  brief: NarrativeBrief | null = null,
): Promise<SceneReplyDraft> {
  const apiKey = requireApiKey(config)

  const detail = await storage.getGame(gameName)
  if (!detail) throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
  const scene = detail.scenes.find(s => s.id === sceneId)
  if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)

  const narrator = detail.setup.narrators.find(n => n.name === detail.setup.narrator) ?? null
  if (!narrator) throw new AiError(400, 'Hra nemá aktuálního vypravěče – vyber ho přes 🎭.')

  const inScene = detail.setup.characters.filter(c => scene.characters.includes(c.name))
  const aiSet = new Set(scene.aiCharacters)
  const aiCharacters = inScene.filter(c => aiSet.has(c.name))
  const playerCharacters = inScene.filter(c => !aiSet.has(c.name))

  const entries = (await storage.getSceneEntries(gameName, sceneId)) ?? []

  let defaultPrompt: string
  try {
    defaultPrompt = await fs.readFile(config.ai.promptPath, 'utf8')
  } catch {
    throw new AiError(500, `Soubor s výchozím promptem nenalezen: ${config.ai.promptPath}`)
  }

  const context = buildSceneContext(detail, scene, { budgetTokens: config.ai.contextTokens })
  const messages = buildMessages({
    defaultPrompt,
    rulesPrompt: await buildRulesSection(config, detail.setup, true),
    narrator,
    scene,
    playerCharacters,
    aiCharacters,
    entries,
    contextSections: context.sections,
    rejectedReasons,
    briefSection: brief ? buildBriefSection(brief, detail) : undefined,
    transcriptBudgetTokens: config.ai.transcriptTokens,
  })
  if (config.ai.debug) {
    const dump = messages.map(m => `───── ${m.role.toUpperCase()} ─────\n${m.content}`).join('\n\n')
    log?.info(
      `[AI] provider=${PROVIDER_LABEL[config.ai.provider]} model=${config.ai.model} scéna="${scene.title}" hráč=[${playerCharacters.map(c => c.name).join(', ')}] AI=[${aiCharacters.map(c => c.name).join(', ')}] kontext≈${context.tokensUsed} tokenů (${context.included.length} položek, ${context.dropped} vynecháno)${brief ? ` režie=${brief.id}` : ''}\n${dump}`,
    )
  }
  const raw = await chatCompletion(config.ai.provider, messages, {
    apiKey,
    model: config.ai.model,
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
  })
  if (config.ai.debug) log?.info(`[AI] odpověď modelu:\n${raw}`)

  // Řádky uvozené jménem předchozího vypravěče scény se uloží pod aktuálního
  const newEntries = parseAiReply(raw, inScene, narrator, previousNarratorNames(entries, narrator))
  if (newEntries.length === 0) throw new AiError(502, 'Odpověď AI se nepodařilo převést na záznamy scény.')
  return { entries: newEntries, raw, context }
}
