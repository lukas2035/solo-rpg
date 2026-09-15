import { useEffect, useState, type ReactNode } from 'react'
import { ApiError, setVaultPath } from '../utils/api'
import { setStoredVaultPath, useVaultPath } from '../utils/vaultPath'
import VaultSetup from './VaultSetup'

type State = 'checking' | 'setup' | 'ready'

/**
 * Při startu zkontroluje složku s hrami uloženou v prohlížeči: bez ní zobrazí výběr složky,
 * s ní přepne BE na tuto složku a teprve pak vykreslí aplikaci.
 */
export default function VaultGate({ children }: { children: ReactNode }) {
  const storedPath = useVaultPath()
  const [state, setState] = useState<State>(storedPath ? 'checking' : 'setup')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (state !== 'checking' || !storedPath) return
    let cancelled = false
    setVaultPath(storedPath)
      .then(info => {
        if (cancelled) return
        if (info.path !== storedPath) setStoredVaultPath(info.path)
        setState('ready')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof ApiError) {
          // Složka už neexistuje / neplatná cesta – nechat uživatele vybrat znovu
          setError(`Uloženou složku s hrami se nepodařilo otevřít: ${e.message}`)
          setState('setup')
        } else {
          // BE neběží – aplikaci pustit dál, úvodní stránka zobrazí vlastní hlášku o spojení
          setState('ready')
        }
      })
    return () => { cancelled = true }
  }, [state, storedPath])

  if (state === 'ready') return <>{children}</>

  return (
    <div className="flex flex-col min-h-screen mx-auto max-w-[1126px] border-x border-[var(--border)] text-center">
      <section className="py-8 px-4 flex-1 flex flex-col justify-center items-center">
        <h1 className="text-5xl md:text-6xl font-bold text-[var(--accent)] mb-6">Solo RPG Editor</h1>
        {state === 'checking' ? (
          <p className="text-[var(--text)]">Otevírám složku s hrami…</p>
        ) : (
          <>
            <p className="text-lg text-[var(--text)] mb-8 max-w-md">
              Nejdřív vyber složku, kde budou uložené tvoje hry. Volba se uloží v tomto prohlížeči a na úvodní stránce ji můžeš kdykoli změnit.
            </p>
            <VaultSetup
              currentPath={storedPath}
              initialError={error}
              onConfirmed={() => { setError(null); setState('ready') }}
            />
          </>
        )}
      </section>
    </div>
  )
}
