import fs from 'node:fs/promises'
import type { ProseAiRequest, ProseAiResponse, ProsePromptEntry } from '@solo-rpg/shared'
import type { FastifyBaseLogger as Logger } from 'fastify'
import type { Config } from '../config.js'
import type { StorageProvider } from '../vault/StorageProvider.js'
import { NotFoundError } from '../vault/StorageProvider.js'
import { proseDocToMarkdown } from '../vault/proseMarkdown.js'
import { AiError, PROVIDER_LABEL, chatCompletion, requireApiKey, type ChatMessage } from './provider.js'

/** Maximální počet položek v historii AI scény (nejnovější první) */
export const MAX_PROSE_PROMPTS = 50

/**
 * AI v editoru prózy (režim scény „próza“). Dvě varianty podle `request.mode`:
 * - `continue`: do promptu jde celý dosavadní text bez obrázků (oříznutý zepředu na rozpočet `AI_TRANSCRIPT_TOKENS`),
 *   popis scény a pokyn autora; model napíše pokračování, které FE připíše na konec editoru.
 * - `rewrite`: FE pošle označený úsek a text před/za ním (kontext, oříznutý na rozpočet); model vrátí jen nový úsek,
 *   FE ho ukáže jako diff a po potvrzení jím nahradí původní.
 * Pokyn i odpověď se uloží do historie scény (`prosePrompts`), aby šly znovu použít / zkopírovat.
 */
export async function runProseAi(storage: StorageProvider, config: Config, gameName: string, sceneId: string, request: ProseAiRequest, log?: Logger): Promise<ProseAiResponse> {
  const apiKey = requireApiKey(config)

  const detail = await storage.getGame(gameName)
  if (!detail) throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
  const scene = detail.scenes.find(s => s.id === sceneId)
  if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)
  if (scene.mode !== 'prose') throw new AiError(400, 'Scéna není v režimu „próza“.')

  const promptPath = request.mode === 'rewrite' ? config.ai.proseRewritePromptPath : config.ai.prosePromptPath
  let systemPrompt: string
  try {
    systemPrompt = await fs.readFile(promptPath, 'utf8')
  } catch {
    throw new AiError(500, `Soubor s promptem pro AI prózy nenalezen: ${promptPath}`)
  }

  const budget = config.ai.transcriptTokens * 4
  const sections: string[] = []
  const sceneLines = [`## Scéna: ${scene.title}`]
  if (scene.description.trim()) sceneLines.push(scene.description.trim())
  sections.push(sceneLines.join('\n'))

  if (request.mode === 'continue') {
    const doc = await storage.getSceneDocument(gameName, sceneId)
    // Obrázky se vynechají (resolveImage → null), AI dostane jen text
    const fullText = doc ? proseDocToMarkdown(doc, () => null).trim() : ''
    const existing = trimToBudget(fullText, budget)
    if (existing) {
      sections.push(`## Dosavadní text${existing.truncated ? ' (začátek vynechán, zobrazen jen závěr)' : ''}\n${existing.text}`)
    } else {
      sections.push('## Dosavadní text\n(zatím nic – příběh teprve začíná)')
    }
    sections.push(`## Pokyn autora\n${request.prompt.trim()}`)
    sections.push(existing ? '## Úkol\nNapiš pokračování, které plynule naváže na poslední větu dosavadního textu. Vrať jen nový text.' : '## Úkol\nZačni příběh podle pokynu autora. Vrať jen text příběhu.')
  } else {
    // Kontext kolem úseku: před ním se ořízne zepředu (zůstane závěr), za ním zezadu (zůstane začátek)
    const before = trimToBudget(request.before.trim(), budget)
    const after = trimToBudgetEnd(request.after.trim(), budget)
    if (before) sections.push(`## Text před upravovaným úsekem${before.truncated ? ' (začátek vynechán)' : ''}\n${before.text}`)
    sections.push(`## Upravovaný úsek\n${request.selection.trim()}`)
    if (after) sections.push(`## Text za upravovaným úsekem${after.truncated ? ' (konec vynechán)' : ''}\n${after.text}`)
    if (request.previous?.trim()) {
      sections.push(`## Předchozí pokus (autorovi nevyhověl, nepoužívej ho doslova)\n${request.previous.trim()}`)
    }
    sections.push(`## Pokyn autora\n${request.prompt.trim()}`)
    sections.push('## Úkol\nPřepracuj upravovaný úsek podle pokynu autora tak, aby plynule navazoval na text před ním i za ním. Vrať jen nový text úseku (nahradí původní).')
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt.trim() },
    { role: 'user', content: sections.join('\n\n') },
  ]
  if (config.ai.debug) {
    const dump = messages.map(m => `───── ${m.role.toUpperCase()} ─────\n${m.content}`).join('\n\n')
    log?.info(`[AI próza/${request.mode}] provider=${PROVIDER_LABEL[config.ai.provider]} model=${config.ai.model} scéna="${scene.title}"\n${dump}`)
  }
  const raw = await chatCompletion(config.ai.provider, messages, {
    apiKey,
    model: config.ai.model,
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
  })
  if (config.ai.debug) log?.info(`[AI próza/${request.mode}] odpověď modelu:\n${raw}`)

  const text = raw.trim()
  const prompts = addEntry(scene.prosePrompts, { mode: request.mode, prompt: request.prompt.trim(), response: text, createdAt: Date.now() })
  const updated = await storage.updateScene(gameName, sceneId, { title: scene.title, prosePrompts: prompts })

  return { text, prompts: updated.prosePrompts }
}

/** Přidá položku na začátek historie (každé odeslání = nová položka), oříznuto na MAX_PROSE_PROMPTS */
export function addEntry(history: readonly ProsePromptEntry[], entry: ProsePromptEntry): ProsePromptEntry[] {
  if (!entry.prompt.trim()) return [...history]
  return [entry, ...history].slice(0, MAX_PROSE_PROMPTS)
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

/** Ořízne text zezadu na rozpočet znaků (zachová začátek, do konce předchozího odstavce) */
export function trimToBudgetEnd(text: string, maxChars: number): { text: string; truncated: boolean } | null {
  if (!text) return null
  if (text.length <= maxChars) return { text, truncated: false }
  let head = text.slice(0, maxChars)
  const para = head.lastIndexOf('\n\n')
  if (para > head.length / 2) head = head.slice(0, para)
  return { text: head.trimEnd(), truncated: true }
}