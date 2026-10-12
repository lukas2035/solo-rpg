import { useState } from 'react'
import { inputClass } from '../utils/forms'

interface AiPromptModalProps {
  narratorName: string
  /** Předvyplněný text (např. prompt z odmítnutého návrhu) */
  initialPrompt?: string
  /** Odešle prompt do AI (jen pro toto jedno volání); dialog se zavře, chyba se ukáže v panelu AI */
  onSubmit: (prompt: string) => void
  onClose: () => void
}

/**
 * Dialog „Zadat prompt“: jednorázový pokyn hráče pro další text AI vypravěče (markdown). Pošle se jen s tímto voláním;
 * do scény se zapíše jako záznam typu prompt až s přijetím první repliky návrhu (repliky na něj odkazují).
 */
export default function AiPromptModal({ narratorName, initialPrompt = '', onSubmit, onClose }: AiPromptModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const canSubmit = prompt.trim().length > 0

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit) return
    onSubmit(prompt.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-cyan-500/60 rounded-xl p-6 w-[720px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-cyan-300">✍️ Prompt pro AI vypravěče</h2>
        <p className="text-sm text-[var(--text)] opacity-80">
          Co má {narratorName} v dalším textu udělat – kam příběh posunout, co popsat, čeho se vyvarovat. Pokyn platí jen pro
          toto jedno volání; do scény se zapíše jako samostatný záznam „Prompt AI“ až s přijetím první repliky návrhu
          (zobrazení promptů přepíná zaškrtávátko 💬 v liště scény).
        </p>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Prompt (markdown, Ctrl+Enter odešle)
          <textarea
            rows={10}
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={'Např.: Nech do hospody vejít cizince v plášti, který hledá Kláru. Nepopisuj ještě, kdo to je.'}
            className={`${inputClass} text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors">
            Zrušit
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-md border border-cyan-400 bg-cyan-700/50 text-cyan-50 font-semibold hover:bg-cyan-600/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🤖 Poslat AI
          </button>
        </div>
      </form>
    </div>
  )
}
