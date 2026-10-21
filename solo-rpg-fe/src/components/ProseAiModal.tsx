import { useMemo, useState } from 'react'
import { diffWords } from 'diff'
import type { ProseAiMode, ProsePromptEntry } from '@solo-rpg/shared'
import { inputClass } from '../utils/forms'

/** Úsek zachycený editorem při otevření dialogu – markdown úseku a textu před/za ním (kontext pro AI) */
export interface ProseRewriteTarget {
  selection: string
  before: string
  after: string
  /** Bez výběru v editoru se upravuje celý text */
  whole: boolean
}

/** Nepotvrzený návrh úpravy – dialog ho hlásí editoru, aby přežil zavření dialogu */
export interface ProseAiDraft {
  prompt: string
  result: string
  /** Počet obrázků, které model vynechal a editor je do výsledku vrátil (upozornění v dialogu) */
  restoredImages?: number
}

interface ProseAiModalProps {
  /** Historie AI této scény (nejnovější první) */
  prompts: ProsePromptEntry[]
  /** Úsek k přepracování; null = dokument je prázdný, úprava není k dispozici */
  rewriteTarget: ProseRewriteTarget | null
  /** Dříve vygenerovaný návrh čekající na potvrzení (po znovuotevření dialogu) */
  draft: ProseAiDraft | null
  /** Nový návrh k potvrzení / aktualizovaný pokyn; null = návrh použit nebo zahozen */
  onDraftChange: (draft: ProseAiDraft | null) => void
  /** Pokračování: pošle pokyn, editor text připíše; po úspěchu se dialog zavře. Chyba se zobrazí v dialogu. */
  onContinue: (prompt: string) => Promise<void>
  /** Úprava: pošle pokyn (+ předchozí nevyhovující pokus) a vrátí nový markdown úseku k náhledu */
  onRewrite: (prompt: string, previous?: string) => Promise<{ text: string; restoredImages: number }>
  /** Potvrzení úpravy: editor nahradí původní úsek */
  onApplyRewrite: (text: string) => void
  onDeletePrompt: (entry: ProsePromptEntry) => Promise<void>
  onClose: () => void
}

const MODE_LABEL: Record<ProseAiMode, string> = { continue: '✍️ Pokračování', rewrite: '🔁 Úprava textu' }

/**
 * Dialog „AI“ pro editor prózy se dvěma režimy:
 * - pokračování: pokyn autora → model napíše další text, editor ho připíše na konec;
 * - úprava: model přepracuje označený úsek (bez výběru celý text); výsledek se ukáže jako diff (nový text zvýrazněný,
 *   smazaný přeškrtnutý) a autor ho potvrdí, nechá přepracovat s dalším pokynem, nebo zahodí.
 * Pod tím historie této scény – pokyn i odpověď AI (kopírování, znovupoužití pokynu, mazání).
 * Dokud čeká návrh, dialog se zavře jen tlačítky; po „Zavřít“ zůstane návrh v editoru a dialog ho při dalším otevření obnoví.
 */
export default function ProseAiModal({ prompts, rewriteTarget, draft, onDraftChange, onContinue, onRewrite, onApplyRewrite, onDeletePrompt, onClose }: ProseAiModalProps) {
  const canRewrite = rewriteTarget !== null
  const [mode, setMode] = useState<ProseAiMode>(draft || (canRewrite && !rewriteTarget.whole) ? 'rewrite' : 'continue')
  const [prompt, setPrompt] = useState(draft?.prompt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  /** Výsledek úpravy čekající na potvrzení */
  const [result, setResult] = useState<string | null>(draft?.result ?? null)
  const [restoredImages, setRestoredImages] = useState(draft?.restoredImages ?? 0)
  const [view, setView] = useState<'diff' | 'result'>('diff')
  const [showOriginal, setShowOriginal] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const canSubmit = prompt.trim().length > 0 && !busy

  const diff = useMemo(() => (result !== null && rewriteTarget ? diffWords(rewriteTarget.selection, result) : null), [result, rewriteTarget])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'continue') {
        await onContinue(prompt.trim())
        onClose()
        return
      }
      // „Přepracovat“ posílá i předchozí pokus, aby model věděl, čemu se vyhnout
      const { text, restoredImages: restored } = await onRewrite(prompt.trim(), result ?? undefined)
      setResult(text)
      setRestoredImages(restored)
      setView('diff')
      onDraftChange({ prompt: prompt.trim(), result: text, restoredImages: restored })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generování selhalo.')
    } finally {
      setBusy(false)
    }
  }

  const accept = () => {
    if (result === null) return
    onApplyRewrite(result)
    onDraftChange(null)
    onClose()
  }

  const discard = () => {
    onDraftChange(null)
    onClose()
  }

  /** Zavření s ponecháním návrhu (editor ho při dalším otevření obnoví i s rozepsaným pokynem) */
  const closeKeepingDraft = () => {
    if (result !== null) onDraftChange({ prompt, result, restoredImages })
    onClose()
  }

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
    } catch (err) {
      console.error('Kopírování do schránky selhalo:', err)
    }
  }

  const reuse = (entry: ProsePromptEntry) => {
    setPrompt(entry.prompt)
    if (entry.mode === 'rewrite' && canRewrite) setMode('rewrite')
    if (entry.mode === 'continue') setMode('continue')
  }

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      active ? 'border-cyan-400 bg-cyan-700/50 text-cyan-50 font-semibold' : 'border-white/15 text-[var(--text)] hover:border-cyan-400/60'
    }`
  const smallButton = 'px-1.5 h-6 rounded hover:bg-white/15 disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!busy && result === null) onClose() }}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111] border-2 border-cyan-500/60 rounded-xl p-6 w-[860px] max-w-full max-h-full overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-cyan-300">🤖 AI v próze</h2>
          <div className="flex gap-1 ml-auto">
            <button type="button" disabled={busy || result !== null} onClick={() => setMode('continue')} className={tabClass(mode === 'continue')}>{MODE_LABEL.continue}</button>
            <button
              type="button"
              disabled={busy || !canRewrite || result !== null}
              title={canRewrite ? undefined : 'Scéna zatím nemá žádný text k úpravě'}
              onClick={() => setMode('rewrite')}
              className={tabClass(mode === 'rewrite')}
            >
              {MODE_LABEL.rewrite}
            </button>
          </div>
        </div>

        {mode === 'continue' ? (
          <p className="text-sm text-[var(--text)] opacity-80">
            AI dostane celý dosavadní text scény (bez obrázků) a tvůj pokyn; vrácené pokračování se připíše na konec textu.
          </p>
        ) : (
          <p className="text-sm text-[var(--text)] opacity-80">
            {rewriteTarget?.whole
              ? 'V editoru není nic označeno – AI přepracuje celý text scény. Pro úpravu jen části nejdřív označ text v editoru (vezmou se celé odstavce).'
              : 'AI přepracuje označené odstavce podle pokynu; zbytek textu dostane jen jako kontext. Výsledek uvidíš jako porovnání a potvrdíš ho.'}
          </p>
        )}

        {mode === 'rewrite' && rewriteTarget && (
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => setShowOriginal(v => !v)} className="self-start text-xs text-cyan-300 hover:underline">
              {showOriginal ? '▾ Skrýt' : '▸ Zobrazit'} upravovaný úsek ({rewriteTarget.selection.length.toLocaleString('cs')} znaků)
            </button>
            {showOriginal && (
              <pre className="whitespace-pre-wrap break-words font-serif text-sm text-[var(--text)] opacity-90 max-h-40 overflow-y-auto rounded-md border border-white/10 bg-white/5 px-3 py-2">{rewriteTarget.selection}</pre>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1 text-left text-sm text-[var(--text)]">
          {result !== null ? 'Pokyn k přepracování (upravit nebo doplnit; Ctrl+Enter odešle)' : 'Pokyn pro AI (Ctrl+Enter odešle)'}
          <textarea
            rows={result !== null ? 3 : 6}
            autoFocus
            disabled={busy}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder={mode === 'continue'
              ? 'Např.: Pokračuj dialogem mezi Klárou a cizincem, ať se dozví, odkud přišel. Zakonči scénu napětím.'
              : 'Např.: Rozepiš souboj podrobněji, přidej Klářiny pocity a zkrať úvodní popis místnosti.'}
            className={`${inputClass} text-sm resize-y whitespace-pre-wrap`}
          />
        </label>

        {error && <div className="text-sm text-red-300 border border-red-500/40 rounded-md px-3 py-2 bg-red-900/20">{error}</div>}
        {result !== null && restoredImages > 0 && (
          <div className="text-sm text-amber-200 border border-amber-500/40 rounded-md px-3 py-2 bg-amber-900/20">
            🖼 AI v návrhu vynechala {restoredImages === 1 ? '1 obrázek' : restoredImages < 5 ? `${restoredImages} obrázky` : `${restoredImages} obrázků`} – byl{restoredImages === 1 ? '' : 'y'} vrácen{restoredImages === 1 ? '' : 'y'} na přibližně původní místo. Před použitím zkontrolujte umístění.
          </div>
        )}

        {result !== null && diff && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <span className="opacity-80">Návrh AI</span>
              <div className="flex gap-1 ml-auto">
                <button type="button" onClick={() => setView('diff')} className={tabClass(view === 'diff')}>Porovnání</button>
                <button type="button" onClick={() => setView('result')} className={tabClass(view === 'result')}>Jen výsledek</button>
                <button type="button" title="Zkopírovat výsledek do schránky" onClick={() => void copy('result', result)} className={tabClass(false)}>{copied === 'result' ? '✓' : '📋'}</button>
              </div>
            </div>
            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-cyan-500/30 bg-white/5 px-4 py-3 font-serif text-[15px] leading-relaxed text-[var(--text)] whitespace-pre-wrap break-words">
              {view === 'result'
                ? result
                : diff.map((part, i) => part.added
                  ? <ins key={i} className="no-underline bg-green-500/25 text-green-100 rounded-sm">{part.value}</ins>
                  : part.removed
                    ? <del key={i} className="line-through bg-red-500/20 text-red-200/80 rounded-sm">{part.value}</del>
                    : <span key={i}>{part.value}</span>)}
            </div>
            {view === 'diff' && (
              <div className="text-xs opacity-60 text-[var(--text)]">
                <ins className="no-underline bg-green-500/25 text-green-100 px-1 rounded-sm">zelená</ins> = nový text, <del className="bg-red-500/20 text-red-200/80 px-1 rounded-sm">přeškrtnuté</del> = smazáno
              </div>
            )}
          </div>
        )}

        {prompts.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-sm text-[var(--text)] opacity-80">Historie AI této scény (pokyn + odpověď)</div>
            <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
              {prompts.map((entry, i) => {
                const key = `${entry.createdAt}-${i}`
                const open = expanded === i
                return (
                  <li key={key} className="flex flex-col gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-[var(--text)]">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 text-xs opacity-60">
                          <span>{MODE_LABEL[entry.mode]}</span>
                          {entry.createdAt > 0 && <span>{new Date(entry.createdAt).toLocaleString('cs')}</span>}
                        </div>
                        <span className={`whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-3'}`} title={open ? undefined : entry.prompt}>{entry.prompt}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button type="button" title="Použít jako pokyn" disabled={busy} onClick={() => reuse(entry)} className={smallButton}>↩</button>
                        <button type="button" title="Zkopírovat pokyn do schránky" onClick={() => void copy(`${key}-p`, entry.prompt)} className={smallButton}>{copied === `${key}-p` ? '✓' : '📋'}</button>
                        {entry.response && (
                          <button type="button" title="Zkopírovat odpověď AI do schránky" onClick={() => void copy(`${key}-r`, entry.response)} className={smallButton}>{copied === `${key}-r` ? '✓' : '🤖📋'}</button>
                        )}
                        <button type="button" title={open ? 'Sbalit' : 'Zobrazit celý pokyn a odpověď AI'} onClick={() => setExpanded(open ? null : i)} className={smallButton}>{open ? '▾' : '▸'}</button>
                        <button type="button" title="Smazat z historie" disabled={busy} onClick={() => void onDeletePrompt(entry)} className="px-1.5 h-6 rounded hover:bg-red-500/40 disabled:opacity-40">✕</button>
                      </div>
                    </div>
                    {open && (
                      <div className="rounded-md border border-white/10 bg-black/30 px-3 py-2 max-h-48 overflow-y-auto">
                        <div className="text-xs opacity-60 mb-1">Odpověď AI</div>
                        {entry.response
                          ? <pre className="whitespace-pre-wrap break-words font-serif text-sm">{entry.response}</pre>
                          : <span className="text-xs opacity-60 italic">Odpověď se u této položky neuložila.</span>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 flex-wrap">
          {result !== null ? (
            <>
              <button type="button" disabled={busy} onClick={closeKeepingDraft} title="Dialog se zavře, návrh zůstane – znovu ho otevře tlačítko 🤖 AI ● v liště" className="px-4 py-2 rounded-md border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-50">
                Zavřít (návrh zůstane)
              </button>
              <button type="button" disabled={busy} onClick={discard} className="px-4 py-2 rounded-md border border-red-500/40 text-red-200 hover:border-red-400 transition-colors disabled:opacity-50">
                Zahodit návrh
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 rounded-md border border-[var(--accent)]/40 text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-50">
              Zrušit
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-md border border-cyan-400 bg-cyan-700/50 text-cyan-50 font-semibold hover:bg-cyan-600/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? '⏳ Generuji…' : result !== null ? '🔁 Přepracovat' : mode === 'continue' ? '🤖 Napsat pokračování' : '🤖 Upravit text'}
          </button>
          {result !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={accept}
              className="px-4 py-2 rounded-md border border-green-400 bg-green-700/50 text-green-50 font-semibold hover:bg-green-600/60 transition-colors disabled:opacity-50"
            >
              ✓ Použít
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
