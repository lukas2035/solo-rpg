import fs from 'node:fs/promises'
import type { SceneContextSuggestionResponse } from '@solo-rpg/shared'
import type { FastifyBaseLogger as Logger } from 'fastify'
import type { Config } from '../config.js'
import type { StorageProvider } from '../vault/StorageProvider.js'
import { NotFoundError } from '../vault/StorageProvider.js'
import { AiError, PROVIDER_LABEL, chatCompletion, requireApiKey, type ChatMessage } from './provider.js'

/**
 * Nechá model vybrat, které **předchozí** scény (podle pořadí) jsou relevantní pro zadanou scénu –
 * podle jejích postav, názvu, popisu a lokace. Výsledek (názvy scén) se neukládá; FE ho vloží do dialogu scény
 * jako `contextScenes` a `contextBuilder` pak posílá vypravěči jen jejich shrnutí.
 */
export async function suggestContextScenes(storage: StorageProvider, config: Config, gameName: string, sceneId: string, log?: Logger): Promise<SceneContextSuggestionResponse> {
  const apiKey = requireApiKey(config)

  const detail = await storage.getGame(gameName)
  if (!detail) throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
  const scene = detail.scenes.find(s => s.id === sceneId)
  if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)

  const candidates = detail.scenes
    .filter(s => s.id !== scene.id && s.order < scene.order && s.summary.trim())
    .sort((a, b) => a.order - b.order)
  if (candidates.length === 0) throw new AiError(400, 'Před touto scénou není žádná scéna se shrnutím – není z čeho vybírat.')

  let prompt: string
  try {
    prompt = await fs.readFile(config.ai.contextPromptPath, 'utf8')
  } catch {
    throw new AiError(500, `Soubor s promptem pro výběr scén nenalezen: ${config.ai.contextPromptPath}`)
  }

  const characters = detail.setup.characters.filter(c => scene.characters.includes(c.name))
  const target = [`## Scéna, pro kterou vybíráš kontext: ${scene.title}`]
  if (scene.location) target.push(`Lokace: ${scene.location}`)
  if (characters.length) target.push(`Postavy: ${characters.map(c => c.name).join(', ')}`)
  if (scene.description.trim()) target.push(scene.description.trim())
  if (scene.summary.trim()) target.push(`Dosavadní shrnutí této scény:\n${scene.summary.trim()}`)

  const list = candidates
    .map(s => {
      const head = [`### ${s.title} (id: ${s.id}, pořadí ${s.order})`]
      if (s.location) head.push(`Lokace: ${s.location}`)
      if (s.characters.length) head.push(`Postavy: ${s.characters.join(', ')}`)
      return `${head.join('\n')}\n${s.summary.trim()}`
    })
    .join('\n\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.trim() },
    { role: 'user', content: [target.join('\n'), `## Předchozí scény (chronologicky)\n${list}`, '## Úkol\nVyber relevantní scény a odpověz jen jejich id, každé na samostatném řádku.'].join('\n\n') },
  ]
  if (config.ai.debug) {
    const dump = messages.map(m => `───── ${m.role.toUpperCase()} ─────\n${m.content}`).join('\n\n')
    log?.info(`[AI výběr scén] provider=${PROVIDER_LABEL[config.ai.provider]} model=${config.ai.model} scéna="${scene.title}"\n${dump}`)
  }
  const raw = await chatCompletion(config.ai.provider, messages, {
    apiKey,
    model: config.ai.model,
    maxTokens: Math.min(config.ai.maxTokens, 500),
    temperature: 0,
  })
  if (config.ai.debug) log?.info(`[AI výběr scén] odpověď modelu:\n${raw}`)

  return { scenes: parseSelectedScenes(raw, candidates), raw }
}

/** Z odpovědi vytáhne id (případně přesné názvy) známých scén; výsledek chronologicky, bez duplicit */
export function parseSelectedScenes(raw: string, candidates: readonly { id: string; title: string; order: number }[]): string[] {
  const picked = new Set<string>()
  for (const c of candidates) {
    if (raw.includes(c.id)) picked.add(c.id)
  }
  if (picked.size === 0) {
    // Model místo id vrátil názvy – zkusit přesnou shodu řádku s názvem
    const lines = raw.split('\n').map(l => l.replace(/^[-*\d.)\s]+/, '').replace(/[*_`]/g, '').trim().toLocaleLowerCase('cs'))
    for (const c of candidates) if (lines.includes(c.title.toLocaleLowerCase('cs'))) picked.add(c.id)
  }
  return candidates.filter(c => picked.has(c.id)).sort((a, b) => a.order - b.order).map(c => c.title)
}
