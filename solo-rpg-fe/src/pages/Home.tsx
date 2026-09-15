import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isValidGameName } from '@solo-rpg/shared'
import type { GameMeta } from '@solo-rpg/shared'
import { ApiError, listGames, deleteGame, createGame, pickSaveFile, backupGame } from '../utils/api'
import { useVaultPath } from '../utils/vaultPath'
import VaultSetup from '../components/VaultSetup'

/** Název záložního souboru: „<hra> 2026-09-14_20-15.zip“ */
function backupFileName(game: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
  return `${game} ${stamp}.zip`
}

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export default function Home() {
  const navigate = useNavigate()
  const vaultPath = useVaultPath()
  const [games, setGames] = useState<GameMeta[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNewGame, setShowNewGame] = useState(false)
  const [showLoadGame, setShowLoadGame] = useState(false)
  const [showBackup, setShowBackup] = useState(false)
  const [showVaultSetup, setShowVaultSetup] = useState(false)
  const [newGameName, setNewGameName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [backupBusy, setBackupBusy] = useState<string | null>(null)
  const [backupMessage, setBackupMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const refreshGames = () =>
    listGames()
      .then(list => { setGames(list); setLoadError(null) })
      .catch(error => {
        console.error('Načtení seznamu her selhalo:', error)
        setLoadError(
          error instanceof ApiError
            ? `Načtení her selhalo: ${error.message}`
            : 'Nepodařilo se spojit s lokálním serverem (solo-rpg-be). Běží `npm run dev` v kořeni projektu?'
        )
      })

  useEffect(() => {
    refreshGames()
  }, [vaultPath])

  const closePanels = () => {
    setShowNewGame(false)
    setShowLoadGame(false)
    setShowBackup(false)
    setShowVaultSetup(false)
  }

  const latestGame = games[0] ?? null

  const gamePath = (name: string) => `/story/${encodeURIComponent(name)}`

  const handleCreateGame = async () => {
    const name = newGameName.trim()
    if (!name) {
      setNameError('Zadej jméno hry.')
      return
    }
    if (!isValidGameName(name)) {
      setNameError('Jméno hry nesmí obsahovat znaky \\ / : * ? " < > | # ^ [ ] (bude to složka ve vaultu).')
      return
    }
    if (games.some(g => g.name === name)) {
      setNameError('Hra s tímto jménem už existuje.')
      return
    }
    try {
      await createGame(name)
      navigate(gamePath(name))
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Vytvoření hry selhalo.')
    }
  }

  const handleDeleteGame = async (name: string) => {
    if (!window.confirm(`Opravdu smazat hru „${name}" včetně celé složky ve vaultu?`)) return
    try {
      await deleteGame(name)
      setGames(games.filter(g => g.name !== name))
    } catch (error) {
      console.error('Smazání hry selhalo:', error)
    }
  }

  const handleBackupGame = async (name: string) => {
    setBackupBusy(name)
    setBackupMessage(null)
    try {
      const fileName = backupFileName(name)
      let target: string | null
      try {
        target = await pickSaveFile({ title: `Uložit zálohu hry „${name}“`, fileName, extension: 'zip' })
      } catch (error) {
        // Nativní dialog není k dispozici – cestu zadat ručně
        if (!(error instanceof ApiError && error.status === 501)) throw error
        target = window.prompt('Zadej celou cestu k zip souboru se zálohou:', fileName)
      }
      if (!target) return
      const result = await backupGame(name, target)
      setBackupMessage({ kind: 'ok', text: `Záloha uložena: ${result.path} (${formatBytes(result.bytes)})` })
    } catch (error) {
      console.error('Záloha hry selhala:', error)
      setBackupMessage({ kind: 'error', text: `Záloha selhala: ${error instanceof Error ? error.message : 'neznámá chyba'}` })
    } finally {
      setBackupBusy(null)
    }
  }

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="flex flex-col min-h-screen mx-auto max-w-[1126px] border-x border-[var(--border)] text-center">
      <section className="py-8 px-4 flex-1 flex flex-col justify-center items-center">
        <h1 className="text-5xl md:text-6xl font-bold text-[var(--accent)] mb-6">
          Solo RPG Editor
        </h1>
        <p className="text-lg text-[var(--text)] mb-8 max-w-md">
          Napište si svůj vlastní fantasy příběh. Vytvářejte postavy, lokace a interaktivní dialog.
        </p>

        <div className="flex flex-col gap-4 mb-12 w-72">
          <button
            onClick={() => { closePanels(); setShowNewGame(true); setNameError(null) }}
            className="px-8 py-3 bg-[var(--accent)] text-white rounded-lg font-semibold hover:opacity-80 transition-opacity"
          >
            Nová hra
          </button>
          {latestGame && (
            <Link
              to={gamePath(latestGame.name)}
              className="px-8 py-3 border-2 border-[var(--accent)] text-[var(--accent)] rounded-lg font-semibold hover:bg-[var(--accent-bg)] transition-colors"
            >
              Pokračovat v poslední hře
              <span className="block text-xs font-normal opacity-70 mt-1">
                {latestGame.name} · {formatDate(latestGame.updatedAt)}
              </span>
            </Link>
          )}
          {games.length > 0 && (
            <button
              onClick={() => { const next = !showLoadGame; closePanels(); setShowLoadGame(next) }}
              className="px-8 py-3 border-2 border-[var(--accent)] text-[var(--accent)] rounded-lg font-semibold hover:bg-[var(--accent-bg)] transition-colors"
            >
              Načíst hru
            </button>
          )}
          {games.length > 0 && (
            <button
              onClick={() => { const next = !showBackup; closePanels(); setShowBackup(next); setBackupMessage(null) }}
              className="px-8 py-3 border-2 border-[var(--border)] text-[var(--text-h)] rounded-lg font-semibold hover:border-[var(--accent)] transition-colors"
            >
              Zálohovat hru
            </button>
          )}
        </div>

        {/* Dialog pro jméno nové hry */}
        {showNewGame && (
          <div className="flex flex-col gap-2 mb-8 w-72">
            <input
              type="text"
              autoFocus
              value={newGameName}
              onChange={(e) => { setNewGameName(e.target.value); setNameError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGame() }}
              placeholder="Jméno nové hry"
              className="px-4 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            {nameError && <div className="text-sm text-red-400">{nameError}</div>}
            <button
              onClick={handleCreateGame}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-semibold hover:opacity-80 transition-opacity"
            >
              Začít hru
            </button>
          </div>
        )}

        {/* Seznam uložených her */}
        {showLoadGame && (
          <div className="flex flex-col gap-2 mb-8 w-96 max-w-full">
            {games.map(game => (
              <div
                key={game.name}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
              >
                <Link to={gamePath(game.name)} className="flex-1 text-left text-[var(--text)] hover:text-[var(--accent)]">
                  <span className="font-semibold">{game.name}</span>
                  <span className="block text-xs opacity-70">{formatDate(game.updatedAt)}</span>
                </Link>
                <button
                  onClick={() => handleDeleteGame(game.name)}
                  title="Smazat hru"
                  className="px-2 py-1 text-red-400 hover:text-red-300 transition-colors"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}

        {games.length === 0 && !showNewGame && !loadError && !showVaultSetup && (
          <div className="text-sm text-[var(--text)] italic">
            Zatím nemáš žádnou uloženou hru – začni kliknutím na „Nová hra".
          </div>
        )}

        {/* Záloha hry: výběr hry → nativní dialog „Uložit jako“ → zip celé složky */}
        {showBackup && (
          <div className="flex flex-col gap-2 mb-8 w-96 max-w-full">
            <div className="text-sm text-[var(--text)] mb-1">Vyber hru, kterou chceš zabalit do zip archivu:</div>
            {games.map(game => (
              <button
                key={game.name}
                onClick={() => handleBackupGame(game.name)}
                disabled={backupBusy !== null}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-colors text-left disabled:opacity-50"
              >
                <span className="flex-1 text-[var(--text)]">
                  <span className="font-semibold">{game.name}</span>
                  <span className="block text-xs opacity-70">{formatDate(game.updatedAt)}</span>
                </span>
                <span title="Zálohovat">{backupBusy === game.name ? '…' : '💾'}</span>
              </button>
            ))}
            {backupMessage && (
              <div className={`text-sm break-all ${backupMessage.kind === 'ok' ? 'text-green-500' : 'text-red-400'}`}>{backupMessage.text}</div>
            )}
          </div>
        )}

        {/* Změna složky s hrami */}
        {showVaultSetup && (
          <div className="mb-8">
            <VaultSetup
              currentPath={vaultPath}
              onConfirmed={() => { setShowVaultSetup(false); refreshGames() }}
              onCancel={() => setShowVaultSetup(false)}
            />
          </div>
        )}

        {loadError && (
          <div className="text-sm text-red-400 max-w-md">{loadError}</div>
        )}

      </section>

      <footer className="px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text)] flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>Složka s hrami:</span>
        <span className="font-mono text-[var(--text-h)] break-all">{vaultPath ?? '(výchozí složka projektu)'}</span>
        <button
          onClick={() => { const next = !showVaultSetup; closePanels(); setShowVaultSetup(next) }}
          className="text-[var(--accent)] hover:underline"
        >
          Změnit složku
        </button>
      </footer>
    </div>
  )
}
