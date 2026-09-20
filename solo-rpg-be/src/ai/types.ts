/** Společné typy AI vrstvy nezávislé na konkrétním providerovi (OpenRouter / Mistral AI). */

export type AiProvider = 'openrouter' | 'mistral'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
  /** Timeout požadavku v ms */
  timeoutMs?: number
}

/** Chyba AI vrstvy s HTTP stavem pro klienta (502 = provider, 503 = AI nenakonfigurovaná, 400 = chybí vypravěč…) */
export class AiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
