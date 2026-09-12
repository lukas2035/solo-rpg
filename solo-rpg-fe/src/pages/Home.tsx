import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isValidGameName } from '@solo-rpg/shared'
import type { GameMeta } from '@solo-rpg/shared'
import { listGames, deleteGame, createGame } from '../utils/api'
import { hasLegacyGames, importLegacyGames } from '../utils/importLegacyGames'

export default function Home() {
  const navigate = useNavigate()
  const [games, setGames] = useState<GameMeta[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNewGame, setShowNewGame] = useState(false)
  const [showLoadGame, setShowLoadGame] = useState(false)
  const [newGameName, setNewGameName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [legacyAvailable, setLegacyAvailable] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const refreshGames = () =>
    listGames()
      .then(list => { setGames(list); setLoadError(null) })
      .catch(error => {
        console.error('Načtení seznamu her selhalo:', error)
        setLoadError('Nepodařilo se spojit s lokálním serverem (solo-rpg-be). Běží `npm run dev` v kořeni projektu?')
      })

  useEffect(() => {
    refreshGames()
    hasLegacyGames().then(setLegacyAvailable)
  }, [])

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

  const handleImportLegacy = async () => {
    if (!window.confirm('Přenést hry uložené v prohlížeči do Obsidian vaultu? Po úspěšném přenosu budou z prohlížeče smazány.')) return
    setImporting(true)
    setImportMessage(null)
    try {
      const result = await importLegacyGames()
      const parts: string[] = []
      if (result.imported.length) parts.push(`Přeneseno: ${result.imported.map(i => i.to).join(', ')}.`)
      if (result.failed.length) parts.push(`Selhalo: ${result.failed.map(f => `${f.name} (${f.error})`).join(', ')}.`)
      setImportMessage(parts.join(' ') || 'Nebylo co přenášet.')
      setLegacyAvailable(result.failed.length > 0)
      await refreshGames()
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Import selhal.')
    } finally {
      setImporting(false)
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
            onClick={() => { setShowNewGame(true); setShowLoadGame(false); setNameError(null) }}
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
              onClick={() => { setShowLoadGame(!showLoadGame); setShowNewGame(false) }}
              className="px-8 py-3 border-2 border-[var(--accent)] text-[var(--accent)] rounded-lg font-semibold hover:bg-[var(--accent-bg)] transition-colors"
            >
              Načíst hru
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

        {games.length === 0 && !showNewGame && !loadError && (
          <div className="text-sm text-[var(--text)] italic">
            Zatím nemáš žádnou uloženou hru – začni kliknutím na „Nová hra".
          </div>
        )}

        {loadError && (
          <div className="text-sm text-red-400 max-w-md">{loadError}</div>
        )}

        {legacyAvailable && !loadError && (
          <div className="mt-8 flex flex-col items-center gap-2 max-w-md">
            <p className="text-sm text-[var(--text)] opacity-80">
              V prohlížeči jsou hry ze starší verze aplikace.
            </p>
            <button
              onClick={handleImportLegacy}
              disabled={importing}
              className="px-4 py-2 border border-[var(--accent)] text-[var(--accent)] rounded-lg text-sm hover:bg-[var(--accent-bg)] transition-colors disabled:opacity-50"
            >
              {importing ? 'Přenáším…' : 'Přenést hry z prohlížeče do vaultu'}
            </button>
          </div>
        )}
        {importMessage && (
          <div className="mt-2 text-sm text-[var(--text)] max-w-md">{importMessage}</div>
        )}
      </section>
    </div>
  )
}
