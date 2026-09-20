/**
 * Vstupní bod AI vrstvy: podle `AI_PROVIDER` (config.ai.provider) volá OpenRouter nebo Mistral AI.
 * Ostatní moduly importují jen odsud, aby na konkrétním providerovi nezávisely.
 */
import type { Config } from '../config.js'
import { mistralChatCompletion } from './mistral.js'
import { openRouterChatCompletion } from './openRouter.js'
import { AiError, type AiProvider, type ChatMessage, type ChatOptions } from './types.js'

export { AiError, type AiProvider, type ChatMessage, type ChatOptions } from './types.js'

/** Lidský název providera do chybových hlášek a logů */
export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openrouter: 'OpenRouter',
  mistral: 'Mistral AI',
}

/** Název env proměnné s API klíčem daného providera */
export const PROVIDER_API_KEY_ENV: Record<AiProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  mistral: 'MISTRAL_API_KEY',
}

/** Vyhodí 503, pokud pro zvoleného providera chybí API klíč; jinak vrátí klíč. */
export function requireApiKey(config: Config): string {
  if (!config.ai.apiKey) {
    throw new AiError(503, `AI není nakonfigurovaná – doplň ${PROVIDER_API_KEY_ENV[config.ai.provider]} do solo-rpg-be/.env (AI_PROVIDER=${config.ai.provider}) a restartuj server.`)
  }
  return config.ai.apiKey
}

export async function chatCompletion(provider: AiProvider, messages: ChatMessage[], options: ChatOptions): Promise<string> {
  switch (provider) {
    case 'mistral':
      return mistralChatCompletion(messages, options)
    case 'openrouter':
      return openRouterChatCompletion(messages, options)
    default: {
      const unknown: never = provider
      throw new AiError(500, `Neznámý AI provider: ${String(unknown)}`)
    }
  }
}
