import fs from 'node:fs/promises'
import type { AiGenerateResponse } from '@solo-rpg/shared'
import type { FastifyBaseLogger as Logger } from 'fastify'
import type { Config } from '../config.js'
import type { StorageProvider } from '../vault/StorageProvider.js'
import { NotFoundError } from '../vault/StorageProvider.js'
import { AiError, chatCompletion } from './openRouter.js'
import { buildMessages, parseAiReply, previousNarratorNames } from './scenePrompt.js'
import { buildRulesSection } from './rulesPrompt.js'

/**
 * Nechá aktuálního vypravěče hry odpovědět ve scéně: sestaví prompt z vaultu, zavolá OpenRouter,
 * odpověď rozparsuje na záznamy a připíše je na konec scény. Vrací jen nově přidané záznamy.
 */
export async function generateSceneReply(storage: StorageProvider, config: Config, gameName: string, sceneId: string, log?: Logger): Promise<AiGenerateResponse> {
  if (!config.ai.apiKey) throw new AiError(503, 'AI není nakonfigurovaná – doplň OPENROUTER_API_KEY do solo-rpg-be/.env a restartuj server.')

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

  const messages = buildMessages({ defaultPrompt, rulesPrompt: await buildRulesSection(config, detail.setup), narrator, scene, playerCharacters, aiCharacters, entries })
  if (config.ai.debug) {
    const dump = messages.map(m => `───── ${m.role.toUpperCase()} ─────\n${m.content}`).join('\n\n')
    log?.info(`[AI] model=${config.ai.model} scéna="${scene.title}" hráč=[${playerCharacters.map(c => c.name).join(', ')}] AI=[${aiCharacters.map(c => c.name).join(', ')}]\n${dump}`)
  }
  const raw = await chatCompletion(messages, {
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
  })
  if (config.ai.debug) log?.info(`[AI] odpověď modelu:\n${raw}`)

  // Řádky uvozené jménem předchozího vypravěče scény se uloží pod aktuálního
  const newEntries = parseAiReply(raw, inScene, narrator, previousNarratorNames(entries, narrator))
  if (newEntries.length === 0) throw new AiError(502, 'Odpověď AI se nepodařilo převést na záznamy scény.')

  // Scéna se mezitím mohla změnit (další záznam hráče) → připojit k aktuálnímu stavu
  const current = (await storage.getSceneEntries(gameName, sceneId)) ?? entries
  await storage.saveSceneEntries(gameName, sceneId, [...current, ...newEntries])
  return { entries: newEntries, raw }
}
