import fs from 'node:fs/promises'
import type { ProseAiResponse } from '@solo-rpg/shared'
import type { FastifyBaseLogger as Logger } from 'fastify'
import type { Config } from '../config.js'
import type { StorageProvider } from '../vault/StorageProvider.js'
import { NotFoundError } from '../vault/StorageProvider.js'
import { proseDocToMarkdown } from '../vault/proseMarkdown.js'
import { AiError, PROVIDER_LABEL, chatCompletion, requireApiKey, type ChatMessage } from './provider.js'

/** Maximální počet uložených promptů v historii scény (nejnovější první) */
export const MAX_PROSE_PROMPTS = 50

/**
 * Nechá model pokračovat v próze scény (režim „próza“). Do promptu jde celý dosavadní text bez obrázků
 * (oříznutý zepředu na rozpočet `AI_TRANSCRIPT_TOKENS`), popis scény a pokyn autora. Pokyn se uloží
 * do historie promptů scény (`prosePrompts`), aby šel znovu použít. Vrácený text FE připíše na konec editoru.
 */
export async function continueProse(storage: StorageProvider, config: Config, gameName: string, sceneId: string, userPrompt: string, log?: Logger): Promise<ProseAiResponse> {
  const apiKey = requireApiKey(config)

  const detail = await storage.getGame(gameName)
  if (!detail) throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
  const scene = detail.scenes.find(s => s.id === sceneId)
  if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
  if (scene.mode !== 'prose') throw new AiError(400, 'Scéna není v režimu „próza“.')

  let systemPrompt: string
  try {
    systemPrompt = await fs.readFile(config.ai.prosePromptPath, 'utf8')
  } catch {
    throw new AiError(500, `Soubor s promptem pro pokračování prózy nenalezen: ${config.ai.prosePromptPath}`)
  }

  const doc = await storage.getSceneDocument(gameName, sceneId)
  // Obrázky se vynechají (resolveImage → null), AI dostane jen text
  const fullText = doc ? proseDocToMarkdown(doc, () => null).trim() : ''
  const existing = trimToBudget(fullText, config.ai.transcriptTokens * 4)

  const sections: string[] = []
  const sceneLines = [`## Scéna: ${scene.title}`]
  if (scene.description.trim()) sceneLines.push(scene.description.trim())
  sections.push(sceneLines.join('\n'))
  if (existing) {
    sections.push(`## Dosavadní text${existing.truncated ? ' (začátek vynechán, zobrazen jen závěr)' : ''}\n${existing.text}`)
  } else {
    sections.push('## Dosavadní text\n(zatím nic – příběh teprve začíná)')
  }
  sections.push(`## Pokyn autora\n${userPrompt.trim()}`)
  sections.push(existing ? '## Úkol\nNapiš pokračování, které plynule naváže na poslední větu dosavadního textu. Vrať jen nový text.' : '## Úkol\nZačni příběh podle pokynu autora. Vrať jen text příběhu.')

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt.trim() },
    { role: 'user', content: sections.join('\n\n') },
  ]
  if (config.ai.debug) {
    const dump = messages.map(m => `───── ${m.role.toUpperCase()} ─────\n${m.content}`).join('\n\n')
    log?.info(`[AI próza] provider=${PROVIDER_LABEL[config.ai.provider]} model=${config.ai.model} scéna="${scene.title}"\n${dump}`)
  }
  const raw = await chatCompletion(config.ai.provider, messages, {
    apiKey,
    model: config.ai.model,
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
  })
  if (config.ai.debug) log?.info(`[AI próza] odpověď modelu:\n${raw}`)

  const prompts = addPrompt(scene.prosePrompts, userPrompt)
  const updated = await storage.updateScene(gameName, sceneId, { title: scene.title, prosePrompts: prompts })

  return { text: raw.trim(), prompts: updated.prosePrompts }
}

/** Přidá prompt na začátek historie (bez duplicit, oříznuto na MAX_PROSE_PROMPTS) */
export function addPrompt(history: readonly string[], prompt: string): string[] {
  const value = prompt.trim()
  if (!value) return [...history]
  return [value, ...history.filter(p => p !== value)].slice(0, MAX_PROSE_PROMPTS)
}

/** Ořízne text zepředu na rozpočet znaků (zachová konec, od začátku následujícího odstavce) */
export function trimToBudget(text: string, maxChars: number): { text: string; truncated: boolean } | null {
  if (!text) return null
  if (text.length <= maxChars) return { text, truncated: false }
  let tail = text.slice(text.length - maxChars)
  const para = tail.indexOf('\n\n')
  if (para >= 0 && para < tail.length / 2) tail = tail.slice(para + 2)
  return { text: tail.trimStart(), truncated: true }
}
