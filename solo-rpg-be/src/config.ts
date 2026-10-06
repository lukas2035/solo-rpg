import path from 'node:path'
import type { AiProvider } from './ai/types.js'

const AI_PROVIDERS: readonly AiProvider[] = ['openrouter', 'mistral']

/** Výchozí model pro každého providera (id v jeho vlastním katalogu) */
const DEFAULT_MODEL: Record<AiProvider, string> = {
  openrouter: 'mistralai/mistral-medium-3-5',
  mistral: 'mistral-medium-latest',
}

export interface Config {
  /** Výchozí složka pro export/zálohu her ve formátu Obsidian vaultu (v1 zde byla primární data) */
  vaultPath: string
  port: number
  /** Připojení k Postgresu (docker-compose.yml v rootu monorepa) */
  databaseUrl: string
  /** Složka s lokálními daty mimo DB (assety) */
  dataDir: string
  /** Nastavení AI vypravěče; `apiKey` null = AI vypnutá (endpoint vrací 503) */
  ai: {
    /** Zvolený provider (AI_PROVIDER); `apiKey` a `model` jsou už vyřešené pro něj */
    provider: AiProvider
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
  const databaseUrl = process.env.DATABASE_URL?.trim() || 'postgres://solo:solo@localhost:5432/solo_rpg'
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? '../data')
  const port = Number(process.env.PORT ?? 3001)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Neplatný PORT: ${process.env.PORT}`)
  }
  const providerRaw = (process.env.AI_PROVIDER?.trim() || 'openrouter').toLowerCase()
  if (!(AI_PROVIDERS as readonly string[]).includes(providerRaw)) {
    throw new Error(`Neplatný AI_PROVIDER: ${process.env.AI_PROVIDER} (povolené: ${AI_PROVIDERS.join(', ')})`)
  }
  const provider = providerRaw as AiProvider
  const apiKey = (provider === 'mistral' ? process.env.MISTRAL_API_KEY : process.env.OPENROUTER_API_KEY)?.trim() || null
  const model = (provider === 'mistral' ? process.env.MISTRAL_MODEL : process.env.OPENROUTER_MODEL)?.trim() || DEFAULT_MODEL[provider]
  const promptPath = path.resolve(process.cwd(), process.env.AI_PROMPT_PATH ?? 'prompts/scene-prompt.md')
  const summaryPromptPath = path.resolve(process.cwd(), process.env.AI_SUMMARY_PROMPT_PATH ?? 'prompts/scene-summary-prompt.md')
  const rulesPromptPath = path.resolve(process.cwd(), process.env.AI_RULES_PROMPT_PATH ?? 'prompts/rules-prompt.md')
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? 1500)
  const temperature = Number(process.env.AI_TEMPERATURE ?? 0.9)
  const debug = /^(1|true|yes)$/i.test(process.env.AI_DEBUG ?? '')
  return { vaultPath, port, databaseUrl, dataDir, ai: { provider, apiKey, model, promptPath, summaryPromptPath, rulesPromptPath, maxTokens, temperature, debug } }
}
