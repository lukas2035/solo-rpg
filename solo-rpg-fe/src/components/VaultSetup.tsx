import { useEffect, useState } from 'react'
import { ApiError, getVaultInfo, pickFolder, setVaultPath } from '../utils/api'
import { setStoredVaultPath } from '../utils/vaultPath'

interface Props {
  /** Aktuálně uložená cesta (předvyplní se do pole) */
  currentPath: string | null
  /** Zavolá se po úspěšném přepnutí BE na novou složku */
  onConfirmed: (path: string) => void
  /** Zrušení (jen když už je nějaká složka nastavená) */
  onCancel?: () => void
  /** Úvodní chybová hláška (např. když uložená složka už neexistuje) */
  initialError?: string | null
}

/**
 * Výběr složky, ve které jsou uložené hry. Zobrazuje se při prvním spuštění (bez uložené cesty)
 * a z úvodní stránky přes „Změnit složku“. Cesta se ukládá do localStorage prohlížeče.
 */
export default function VaultSetup({ currentPath, onConfirmed, onCancel, initialError = null }: Props) {
  const [path, setPath] = useState(currentPath ?? '')
  const [defaultPath, setDefaultPath] = useState<string | null>(null)
  const [nativeDialogs, setNativeDialogs] = useState(true)
  const [error, setError] = useState<string | null>(initialError)
  const [offerCreate, setOfferCreate] = useState(false)
  const [busy, setBusy] = useState<'pick' | 'save' | null>(null)

  useEffect(() => {
    getVaultInfo()
      .then(info => {
        setDefaultPath(info.defaultPath)
        setNativeDialogs(info.nativeDialogs)
        setPath(previous => previous || info.path)
      })
      .catch(() => {
        setError('Nepodařilo se spojit s lokálním serverem (solo-rpg-be). Běží `npm run dev` v kořeni projektu?')
      })
  }, [])

  const handlePick = async () => {
    setBusy('pick')
    setError(null)
    try {
      const picked = await pickFolder({ title: 'Vyber složku, ve které budou uložené hry', initialPath: path.trim() || undefined })
      if (picked) setPath(picked)
    } catch (e) {
      if (e instanceof ApiError && e.status === 501) setNativeDialogs(false)
      setError(e instanceof Error ? e.message : 'Výběr složky selhal.')
    } finally {
      setBusy(null)
    }
  }

  const handleConfirm = async (create = false) => {
    const trimmed = path.trim()
    if (!trimmed) {
      setError('Zadej cestu ke složce.')
      return
    }
    setBusy('save')
    setError(null)
    setOfferCreate(false)
    try {
      const info = await setVaultPath(trimmed, create)
      setStoredVaultPath(info.path)
      onConfirmed(info.path)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Nastavení složky selhalo.'
      setError(message)
      if (e instanceof ApiError && e.status === 400 && /neexistuje/.test(message)) setOfferCreate(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 w-[32rem] max-w-full text-left">
      <label className="text-sm text-[var(--text)]">Složka, ve které jsou uložené hry (každá hra = podsložka):</label>
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          value={path}
          onChange={e => { setPath(e.target.value); setError(null); setOfferCreate(false) }}
          onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
          placeholder="např. D:\SoloRPG\hry"
          spellCheck={false}
          className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--text-h)] font-mono text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        {nativeDialogs && (
          <button
            type="button"
            onClick={handlePick}
            disabled={busy !== null}
            title="Procházet…"
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-h)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            {busy === 'pick' ? '…' : '📂'}
          </button>
        )}
      </div>
      {defaultPath && defaultPath !== path.trim() && (
        <button
          type="button"
          onClick={() => { setPath(defaultPath); setError(null); setOfferCreate(false) }}
          className="self-start text-xs text-[var(--text)] hover:text-[var(--accent)] underline"
        >
          Použít výchozí složku projektu ({defaultPath})
        </button>
      )}
      {error && <div className="text-sm text-red-400">{error}</div>}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Zrušit
          </button>
        )}
        {offerCreate && (
          <button
            type="button"
            onClick={() => handleConfirm(true)}
            disabled={busy !== null}
            className="px-4 py-2 rounded-lg border-2 border-[var(--accent)] text-[var(--accent)] font-semibold hover:bg-[var(--accent-bg)] transition-colors disabled:opacity-50"
          >
            Vytvořit složku a použít
          </button>
        )}
        <button
          type="button"
          onClick={() => handleConfirm()}
          disabled={busy !== null}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {busy === 'save' ? 'Otevírám…' : 'Použít tuto složku'}
        </button>
      </div>
    </div>
  )
}
