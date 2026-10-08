/**
 * Minimální klient Mistral AI Chat Completions API (https://api.mistral.ai/v1/chat/completions).
 * Formát požadavku i odpovědi je kompatibilní s OpenAI; bez streamování.
 */
import { AiError, type ChatMessage, type ChatOptions } from './types.js'

interface MistralChatResponse {
  choices?: { message?: { content?: string | null } }[]
  /** Mistral vrací chybu buď jako `message` na nejvyšší úrovni, zabalenou v `error`, nebo (422) jako `detail` */
  message?: string
  error?: { message?: string } | string
  detail?: unknown
}

function describeError(data: MistralChatResponse | null, fallback: string): string {
  if (!data) return fallback
  if (typeof data.error === 'string') return data.error
  const message = data.error?.message ?? data.message
  if (message) return message
  if (data.detail !== undefined) return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
  return fallback
}

export async function mistralChatCompletion(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  })

  const text = await response.text()
  let data: MistralChatResponse | null = null
  try {
    data = JSON.parse(text) as MistralChatResponse
  } catch {
    // tělo není JSON – ošetří se níže
  }
  if (!response.ok) {
    const detail = data ? describeError(data, text) : text
    throw new AiError(502, `Mistral AI odpověděl HTTP ${response.status}: ${detail.slice(0, 500)}`)
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiError(502, describeError(data, 'Mistral AI vrátil prázdnou odpověď.'))
  }
  return content
}
