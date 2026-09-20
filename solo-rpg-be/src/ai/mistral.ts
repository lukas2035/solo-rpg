/**
 * Minimální klient Mistral AI Chat Completions API (https://api.mistral.ai/v1/chat/completions).
 * Formát požadavku i odpovědi je kompatibilní s OpenAI; bez streamování.
 */
import { AiError, type ChatMessage, type ChatOptions } from './types.js'

interface MistralChatResponse {
  choices?: { message?: { content?: string | null } }[]
  /** Mistral vrací chybu buď jako `message` na nejvyšší úrovni, nebo zabalenou v `error` */
  message?: string
  error?: { message?: string } | string
}

function describeError(data: MistralChatResponse | null, fallback: string): string {
  if (!data) return fallback
  if (typeof data.error === 'string') return data.error
  return data.error?.message ?? data.message ?? fallback
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

  let data: MistralChatResponse | null = null
  try {
    data = (await response.json()) as MistralChatResponse
  } catch {
    // tělo není JSON – ošetří se níže
  }
  if (!response.ok) {
    throw new AiError(502, describeError(data, `Mistral AI odpověděl HTTP ${response.status}.`))
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiError(502, describeError(data, 'Mistral AI vrátil prázdnou odpověď.'))
  }
  return content
}
