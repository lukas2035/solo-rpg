import path from 'node:path'

export interface Config {
  vaultPath: string
  port: number
  /** Nastavení AI vypravěče přes OpenRouter; `apiKey` null = AI vypnutá (endpoint vrací 503) */
  ai: {
    apiKey: string | null
    model: string
    /** Absolutní cesta k souboru s výchozím promptem pro vedení scény */
    promptPath: string
    /** Absolutní cesta k souboru s promptem pro AI shrnutí děje scény */
    summaryPromptPath: string
    /** Absolutní cesta k souboru s promptem o kostkách/orákulu a herních pravidlech pod příběhem */
    rulesPromptPath: string
    /** Limit délky odpovědi modelu (tokeny) */
    maxTokens: number
    temperature: number
    /** Logovat celý odeslaný prompt a surovou odpověď modelu (AI_DEBUG=1) */
    debug: boolean
  }
}

export function loadConfig(): Config {
  const vaultPath = path.resolve(process.cwd(), process.env.VAULT_PATH ?? '../vault')
  const port = Number(process.env.PORT ?? 3001)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Neplatný PORT: ${process.env.PORT}`)
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || null
  const model = process.env.OPENROUTER_MODEL?.trim() || 'mistralai/mistral-large-2512'
  const promptPath = path.resolve(process.cwd(), process.env.AI_PROMPT_PATH ?? 'prompts/scene-prompt.md')
  const summaryPromptPath = path.resolve(process.cwd(), process.env.AI_SUMMARY_PROMPT_PATH ?? 'prompts/scene-summary-prompt.md')
  const rulesPromptPath = path.resolve(process.cwd(), process.env.AI_RULES_PROMPT_PATH ?? 'prompts/rules-prompt.md')
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? 1500)
  const temperature = Number(process.env.AI_TEMPERATURE ?? 0.9)
  const debug = /^(1|true|yes)$/i.test(process.env.AI_DEBUG ?? '')
  return { vaultPath, port, ai: { apiKey, model, promptPath, summaryPromptPath, rulesPromptPath, maxTokens, temperature, debug } }
}
