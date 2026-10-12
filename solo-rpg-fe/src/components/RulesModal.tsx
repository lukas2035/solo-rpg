import { useEffect, useState } from 'react'
import type { RulesSystem } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'

export interface RulesFormValues {
  rules: string
  rulesSystem: RulesSystem
}

interface RulesModalProps {
  rules: string
  rulesSystem: RulesSystem
  onSubmit: (values: RulesFormValues) => Promise<void>
  onClose: () => void
}

const RULES_SYSTEM_OPTIONS: { value: RulesSystem; label: string }[] = [
  { value: 'none', label: 'žádný / jiný – v režii zůstane jen obtížnost 1–5' },
  { value: 'dnd5e', label: 'D&D 5e – obtížnost jako DC 10 / 13 / 15 / 18 / 20' },
  { value: 'vtm5e', label: 'Vampire: The Masquerade 5e – Difficulty 2–6' },
  { value: 'fate', label: 'Fate – žebřík +1 (Average) … +5 (Superb)' },
]

/**
 * Dialog „Pravidla pod příběhem“: markdown popis pravidlového systému, který hráč používá (VtM 5e, D&D 5e, Fate…,
 * případně tabulka pro výklad orákula) a systém pro překlad obtížnosti v režii. Zda se popis posílá AI vypravěči,
 * se nastavuje per scéna v dialogu 🤖 AI. Do textového exportu hry se popis dává vždy.
 */
export default function RulesModal({ rules: initialRules, rulesSystem: initialSystem, onSubmit, onClose }: RulesModalProps) {
  const [rules, setRules] = useState(initialRules)
  const [rulesSystem, setRulesSystem] = useState<RulesSystem>(initialSystem)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ rules: rules.trim(), rulesSystem })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení pravidel selhalo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-[var(--accent)]/60 rounded-xl p-6 w-[720px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-[var(--accent)]">🎲 Pravidla pod příběhem</h2>
        <p className="text-sm text-[var(--text)] opacity-80">
          Jaký pravidlový systém běží pod tímto příběhem (VtM 5e, D&amp;D 5e, AD&amp;D 2e, Fate Condensed…) a co znamenají hody,
          které si do textu zapisuješ. Můžeš sem dát i vlastní tabulku pro výklad orákula. Nechej prázdné, když žádná pravidla
          nepoužíváš. Zda se popis posílá AI vypravěči, nastavíš pro každou scénu zvlášť v dialogu 🤖 AI.
        </p>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          Popis pravidel (markdown)
          <textarea
            rows={12}
            autoFocus
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder={'Např.: Vampire: The Masquerade 5e. Hody zapisuju jako „Síla + Rvačka: 3 úspěchy vs. obtížnost 2“.\nOrákulum: d20 – 1–5 ne a komplikace, 6–10 ne, 11–15 ano, 16–20 ano a bonus.'}
            className={`${inputClass} font-mono text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          <span>
            <span className="font-semibold">Systém pravidel pro režii (Director)</span>
            <span className="block opacity-70">Když režie vyžaduje hod, přeloží abstraktní obtížnost 1–5 do hodnoty tvého systému. Házíš sám a výsledek zadáš do režie.</span>
          </span>
          <select value={rulesSystem} onChange={(e) => setRulesSystem(e.target.value as RulesSystem)} className={inputClass}>
            {RULES_SYSTEM_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Zrušit
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : 'Uložit'}
          </button>
        </div>
      </form>
    </div>
  )
}
