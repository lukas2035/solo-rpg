import fs from 'node:fs/promises'
import type { Narrator, SceneSummaryResponse } from '@solo-rpg/shared'
import type { FastifyBaseLogger as Logger } from 'fastify'
import type { Config } from '../config.js'
import type { StorageProvider } from '../vault/StorageProvider.js'
import { NotFoundError } from '../vault/StorageProvider.js'
import { AiError, chatCompletion, type ChatMessage } from './openRouter.js'
import { formatTranscript } from './scenePrompt.js'
import { buildRulesSection } from './rulesPrompt.js'

/** Zástupný vypravěč pro přepis, když hra žádného nemá (záznamy vypravěče se pak označí obecně) */
const FALLBACK_NARRATOR: Narrator = { id: 'narrator', name: 'Vypravěč', description: '', aiPrompt: '', image: null }

/**
 * Nechá model shrnout děj scény (stejný OpenRouter + model jako AI vypravěč, jiný prompt ze souboru
 * `prompts/scene-summary-prompt.md`). Výsledek se neukládá – FE ho vloží do pole „Shrnutí“ v dialogu scény.
 */
export async function summarizeScene(storage: StorageProvider, config: Config, gameName: string, sceneId: string, log?: Logger): Promise<SceneSummaryResponse> {
  if (!config.ai.apiKey) throw new AiError(503, 'AI není nakonfigurovaná – doplň OPENROUTER_API_KEY do solo-rpg-be/.env a restartuj server.')

  const detail = await storage.getGame(gameName)
  if (!detail) throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
  const scene = detail.scenes.find(s => s.id === sceneId)
  if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)

  const entries = (await storage.getSceneEntries(gameName, sceneId)) ?? []
  if (entries.length === 0) throw new AiError(400, 'Scéna zatím nemá žádné záznamy – není co shrnout.')

  let prompt: string
  try {
    prompt = await fs.readFile(config.ai.summaryPromptPath, 'utf8')
  } catch {
    throw new AiError(500, `Soubor s promptem pro shrnutí scény nenalezen: ${config.ai.summaryPromptPath}`)
  }

  const narrator = detail.setup.narrators.find(n => n.name === detail.setup.narrator) ?? FALLBACK_NARRATOR
  const characters = detail.setup.characters.filter(c => scene.characters.includes(c.name))

  const sections: string[] = []
  const sceneLines = [`## Scéna: ${scene.title}`]
  if (scene.location) sceneLines.push(`Lokace: ${scene.location}`)
  if (scene.description.trim()) sceneLines.push(scene.description.trim())
  sections.push(sceneLines.join('\n'))
  if (characters.length) {
    sections.push(`## Postavy ve scéně\n${characters.map(c => (c.nickname === c.name ? `- ${c.name}` : `- ${c.nickname} (${c.name})`)).join('\n')}`)
  }
  if (scene.summary.trim()) sections.push(`## Dosavadní shrnutí (nahraď novým, aktualizovaným)\n${scene.summary.trim()}`)
  sections.push(`## Přepis scény\n${formatTranscript(entries, characters, narrator)}`)
  sections.push('## Úkol\nShrň děj této scény podle pokynů.')

  const messages: ChatMessage[] = [
    { role: 'system', content: [prompt.trim(), await buildRulesSection(config, detail.setup)].filter(Boolean).join('\n\n') },
    { role: 'user', content: sections.join('\n\n') },
  ]
  if (config.ai.debug) {
    const dump = messages.map(m => `───── ${m.role.toUpperCase()} ─────\n${m.content}`).join('\n\n')
    log?.info(`[AI shrnutí] model=${config.ai.model} scéna="${scene.title}"\n${dump}`)
  }
  const raw = await chatCompletion(messages, {
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    maxTokens: config.ai.maxTokens,
    // Shrnutí má být věcné a stabilní, ne kreativní
    temperature: Math.min(config.ai.temperature, 0.3),
  })
  if (config.ai.debug) log?.info(`[AI shrnutí] odpověď modelu:\n${raw}`)

  return { summary: raw.trim(), raw }
}
