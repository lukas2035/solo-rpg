import fs from 'node:fs/promises'
import type { GameSettings } from '@solo-rpg/shared'
import type { Config } from '../config.js'
import { AiError } from './openRouter.js'

/**
 * Sekce o kostkách a pravidlech, která se připojuje k system promptu AI požadavků – jen když má hra zapnuté
 * `rulesInAi`. Pak jde obecná část (orákulum, hody zapsané v textu) ze souboru `prompts/rules-prompt.md` a za ní
 * popis konkrétních pravidel hry (`settings.rules`), pokud je vyplněný. S vypnutým přepínačem se neposílá nic,
 * aby se AI ve scénách bez kostek zbytečně nemátla.
 */
export async function buildRulesSection(config: Config, settings: Pick<GameSettings, 'rules' | 'rulesInAi'>): Promise<string> {
  if (!settings.rulesInAi) return ''
  let base: string
  try {
    base = await fs.readFile(config.ai.rulesPromptPath, 'utf8')
  } catch {
    throw new AiError(500, `Soubor s promptem o pravidlech nenalezen: ${config.ai.rulesPromptPath}`)
  }
  const parts = [base.trim()]
  const rules = settings.rules.trim()
  if (rules) {
    parts.push(`## Herní pravidla pod příběhem\nHráč používá tento pravidlový systém; hody a mechaniky v textu vykládej podle něj:\n\n${rules}`)
  } else {
    parts.push('## Herní pravidla pod příběhem\nHráč nepoužívá žádný konkrétní pravidlový systém – hody v textu ber jako orákulum a jejich dopad odvozuj jen z hráčovy interpretace.')
  }
  return parts.join('\n\n')
}
