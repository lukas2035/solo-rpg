/**
 * Minimální klient OpenRouter Chat Completions API (kompatibilní s OpenAI formátem).
 * Bez streamování – odpověď se vrací celá, FE zatím zobrazuje jen indikátor „AI píše…“.
 */
import { AiError, type ChatMessage, type ChatOptions } from './types.js'

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[]
  error?: { message?: string; metadata?: { raw?: string; provider_name?: string } }
}

/** OpenRouter u chyb providera vrací obecné "Provider returned error" – skutečný důvod je v metadata.raw. */
function describeError(data: ChatCompletionResponse | null, fallback: string): string {
  const err = data?.error
  if (!err) return fallback
  const message = err.message ?? fallback
  const raw = err.metadata?.raw?.trim()
  if (!raw) return message
  const provider = err.metadata?.provider_name
  return provider ? `${message} (${provider}): ${raw}` : `${message}: ${raw}`
}

export async function openRouterChatCompletion(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
      // Nepovinné hlavičky pro statistiky OpenRouteru
      'http-referer': 'http://localhost:5173',
      'x-title': 'Solo RPG',
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  })

  let data: ChatCompletionResponse | null = null
  try {
    data = (await response.json()) as ChatCompletionResponse
  } catch {
    // tělo není JSON – ošetří se níže
  }
  if (!response.ok) {
    throw new AiError(502, describeError(data, `OpenRouter odpověděl HTTP ${response.status}.`))
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiError(502, describeError(data, 'OpenRouter vrátil prázdnou odpověď.'))
  }
  return content
}
