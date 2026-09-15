/**
 * Minimální klient OpenRouter Chat Completions API (kompatibilní s OpenAI formátem).
 * Bez streamování – odpověď se vrací celá, FE zatím zobrazuje jen indikátor „AI píše…“.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenRouterOptions {
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
  /** Timeout požadavku v ms */
  timeoutMs?: number
}

/** Chyba AI vrstvy s HTTP stavem pro klienta (502 = OpenRouter, 503 = AI nenakonfigurovaná, 400 = chybí vypravěč…) */
export class AiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[]
  error?: { message?: string }
}

export async function chatCompletion(messages: ChatMessage[], options: OpenRouterOptions): Promise<string> {
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
    throw new AiError(502, data?.error?.message ?? `OpenRouter odpověděl HTTP ${response.status}.`)
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiError(502, data?.error?.message ?? 'OpenRouter vrátil prázdnou odpověď.')
  }
  return content
}
