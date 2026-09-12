import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Character, GameSetup, ImageRef, SceneMeta, StoryEntry as ApiStoryEntry } from '@solo-rpg/shared'
import CharacterBar from '../components/CharacterBar'
import StoryPanel from '../components/StoryPanel'
import InputArea from '../components/InputArea'
import PortraitModal from '../components/PortraitModal'
import DmSettingsModal from '../components/DmSettingsModal'
import SceneBar from '../components/SceneBar'
import * as api from '../utils/api'
import { assetUrl } from '../utils/api'

/** Postava s obrázkem převedeným na URL použitelnou v <img> */
interface DisplayCharacter {
  id: string
  name: string
  image: string | null
}

interface StoryEntry {
  id: string
  character: Character | null
  text: string
  timestamp: number
  /** Text je víceřádkový markdown */
  markdown?: boolean
}

const SETUP_AUTOSAVE_MS = 600

export default function StoryEditor() {
  const { storyId } = useParams()
  const navigate = useNavigate()
  // Jméno hry z URL = název složky ve vaultu
  const gameName = decodeURIComponent(storyId ?? 'Bez názvu')

  const [characters, setCharacters] = useState<Character[]>([])
  const [storyEntries, setStoryEntries] = useState<StoryEntry[]>([])
  const [scenes, setScenes] = useState<SceneMeta[]>([])
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null)

  const [selectedPortrait, setSelectedPortrait] = useState<{ image: string; character: string } | null>(null)
  const [backgroundImage, setBackgroundImage] = useState<ImageRef>(null)
  const [brightBackground, setBrightBackground] = useState(false)
  const [dmName, setDmName] = useState('DM')
  const [dmImage, setDmImage] = useState<ImageRef>(null)
  const [showDmSettings, setShowDmSettings] = useState(false)
  const [showShortcutNumbers, setShowShortcutNumbers] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Autosave nastavení spouštíme až po prvním načtení ze serveru
  const setupLoadedRef = useRef(false)
  const lastSavedSetupRef = useRef<string>('')

  const toDisplay = useCallback(
    (c: Character): DisplayCharacter => ({ id: c.id, name: c.name, image: assetUrl(gameName, c.image) }),
    [gameName]
  )
  const displayCharacters = useMemo(() => characters.map(toDisplay), [characters, toDisplay])
  const displayEntries = useMemo(
    () => storyEntries.map(e => ({ ...e, character: e.character ? toDisplay(e.character) : null })),
    [storyEntries, toDisplay]
  )
  const displayBackground = assetUrl(gameName, backgroundImage)
  const displayDmImage = assetUrl(gameName, dmImage)

  // Při držení Ctrl nebo Alt zobrazit u jmen postav jejich pořadové číslo (klávesová zkratka)
  useEffect(() => {
    const update = (e: KeyboardEvent) =>
      setShowShortcutNumbers(e.ctrlKey || e.altKey || e.getModifierState('AltGraph'))
    const reset = () => setShowShortcutNumbers(false)
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', update)
      window.removeEventListener('keyup', update)
      window.removeEventListener('blur', reset)
    }
  }, [])

  /** Položky scény z API → položky s odkazem na postavu (chybějící postavy vytvoří bez obrázku) */
  const resolveEntries = useCallback((stored: ApiStoryEntry[], knownCharacters: Character[]) => {
    const updated = [...knownCharacters]
    let nextId = Math.max(0, ...updated.map(c => parseInt(c.id) || 0)) + 1
    const entries: StoryEntry[] = stored.map(e => {
      let character: Character | null = null
      if (e.characterName !== null) {
        character = updated.find(c => c.name === e.characterName) ?? null
        if (!character) {
          character = { id: (nextId++).toString(), name: e.characterName, image: null }
          updated.push(character)
        }
      }
      return { id: e.id, character, text: e.text, timestamp: e.timestamp, markdown: e.markdown }
    })
    return { entries, characters: updated }
  }, [])

  const applySetup = useCallback((setup: GameSetup) => {
    setBackgroundImage(setup.backgroundImage)
    setBrightBackground(setup.brightBackground)
    setDmName(setup.dm.name)
    setDmImage(setup.dm.image)
    lastSavedSetupRef.current = JSON.stringify(setup)
  }, [])

  // Při otevření hry načíst nastavení, scény a poslední scénu
  useEffect(() => {
    let cancelled = false
    setupLoadedRef.current = false
    ;(async () => {
      try {
        const detail = await api.getGame(gameName)
        if (cancelled) return
        const scene = detail.scenes[detail.scenes.length - 1] ?? null
        const stored = scene ? await api.getSceneEntries(gameName, scene.id) : []
        if (cancelled) return

        const resolved = resolveEntries(stored, detail.setup.characters)
        setCharacters(resolved.characters)
        setStoryEntries(resolved.entries)
        setScenes(detail.scenes)
        setCurrentSceneId(scene?.id ?? null)
        applySetup({ ...detail.setup, characters: resolved.characters })
        setLoadError(null)
        setupLoadedRef.current = true
      } catch (error) {
        console.error('Načtení hry selhalo:', error)
        setLoadError(error instanceof Error ? error.message : 'Načtení hry selhalo.')
      }
    })()
    return () => { cancelled = true }
  }, [gameName, resolveEntries, applySetup])

  const currentSetup = useMemo<GameSetup>(
    () => ({ characters, backgroundImage, brightBackground, dm: { name: dmName, image: dmImage } }),
    [characters, backgroundImage, brightBackground, dmName, dmImage]
  )

  // Automatické ukládání nastavení (postavy, pozadí, DM) do vaultu
  useEffect(() => {
    if (!setupLoadedRef.current) return
    const serialized = JSON.stringify(currentSetup)
    if (serialized === lastSavedSetupRef.current) return
    const timer = setTimeout(() => {
      api.saveSetup(gameName, currentSetup)
        .then(() => { lastSavedSetupRef.current = serialized })
        .catch(error => console.error('Automatické uložení nastavení selhalo:', error))
    }, SETUP_AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [currentSetup, gameName])

  const toApiEntries = (entries: StoryEntry[]): ApiStoryEntry[] =>
    entries.map(e => ({
      id: e.id,
      characterName: e.character ? e.character.name : null,
      text: e.text,
      timestamp: e.timestamp,
      markdown: e.markdown,
    }))

  const persistStory = (entries: StoryEntry[]) => {
    if (!currentSceneId) return
    api.saveSceneEntries(gameName, currentSceneId, toApiEntries(entries))
      .catch(error => console.error('Uložení scény selhalo:', error))
  }

  const handleAddCharacter = () => {
    const newId = (Math.max(0, ...characters.map(c => parseInt(c.id) || 0)) + 1).toString()
    setCharacters([...characters, { id: newId, name: 'Nová postava', image: null }])
  }

  const handleCharacterImageDrop = async (characterId: string, file: File) => {
    const character = characters.find(c => c.id === characterId)
    if (!character) return
    try {
      const ref = await api.storeImage(gameName, 'portrait', file, character.name)
      setCharacters(prev => prev.map(c => (c.id === characterId ? { ...c, image: ref } : c)))
    } catch (error) {
      console.error('Nahrání portrétu selhalo:', error)
    }
  }

  const handleAddEntry = (text: string, selectedCharacterId: string | null, markdown?: boolean) => {
    const selectedCharacter = selectedCharacterId
      ? characters.find(c => c.id === selectedCharacterId)
      : null

    const newEntry: StoryEntry = {
      id: Date.now().toString(),
      character: selectedCharacter || null,
      text,
      timestamp: Date.now(),
      markdown,
    }

    const newEntries = [...storyEntries, newEntry]
    setStoryEntries(newEntries)
    persistStory(newEntries)
  }

  const handleCharacterNameChange = (characterId: string, newName: string) => {
    setCharacters(prev => prev.map(char => (char.id === characterId ? { ...char, name: newName } : char)))
    // Položky příběhu odkazují na postavu objektem – aktualizovat i tam
    setStoryEntries(prev =>
      prev.map(entry =>
        entry.character?.id === characterId ? { ...entry, character: { ...entry.character, name: newName } } : entry
      )
    )
  }

  // Po přejmenování postavy uložit scénu (jméno mluvčího je součástí markdownu)
  const charactersRef = useRef(characters)
  useEffect(() => {
    const renamed = charactersRef.current.some(prev => {
      const next = characters.find(c => c.id === prev.id)
      return next && next.name !== prev.name
    })
    charactersRef.current = characters
    if (renamed) persistStory(storyEntries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters])

  const handleCharacterDelete = (characterId: string) => {
    setCharacters(characters.filter(char => char.id !== characterId))
  }

  const handleEntryDelete = (entryId: string) => {
    const newEntries = storyEntries.filter(entry => entry.id !== entryId)
    setStoryEntries(newEntries)
    persistStory(newEntries)
  }

  const handleEntryEdit = (entryId: string, newText: string) => {
    const newEntries = storyEntries.map(entry =>
      entry.id === entryId ? { ...entry, text: newText } : entry
    )
    setStoryEntries(newEntries)
    persistStory(newEntries)
  }

  const handlePortraitClick = (image: string, characterName: string) => {
    setSelectedPortrait({ image, character: characterName })
  }

  const handleBackgroundImageDrop = async (image: File | string) => {
    try {
      setBackgroundImage(await api.storeImage(gameName, 'background', image))
    } catch (error) {
      console.error('Uložení pozadí selhalo:', error)
    }
  }

  const handleDmSave = async (name: string, image: string | null) => {
    setDmName(name)
    if (image === displayDmImage) return
    if (image === null) {
      setDmImage(null)
      return
    }
    try {
      setDmImage(await api.storeImage(gameName, 'dm', image))
    } catch (error) {
      console.error('Uložení portrétu vypravěče selhalo:', error)
    }
  }

  const handleExportMarkdown = () =>
    storyEntries
      // U víceřádkového markdownu začíná text na novém řádku pod jménem mluvčího
      .map(entry => `**${entry.character ? entry.character.name : dmName}**:${entry.markdown ? '\n' : ' '}${entry.text}`)
      .join('\n\n')

  const handleSaveSetup = async (): Promise<boolean> => {
    try {
      const saved = await api.saveSetup(gameName, currentSetup)
      lastSavedSetupRef.current = JSON.stringify(saved)
      return true
    } catch (error) {
      console.error('Uložení nastavení selhalo:', error)
      return false
    }
  }

  /** Znovu načte nastavení z vaultu (např. po úpravě v Obsidianu) */
  const handleLoadSetup = async (): Promise<boolean> => {
    try {
      const detail = await api.getGame(gameName)
      const resolved = resolveEntries(toApiEntries(storyEntries), detail.setup.characters)
      setCharacters(resolved.characters)
      setStoryEntries(resolved.entries)
      setScenes(detail.scenes)
      applySetup({ ...detail.setup, characters: resolved.characters })
      return true
    } catch (error) {
      console.error('Načtení nastavení selhalo:', error)
      return false
    }
  }

  /** Znovu načte aktuální scénu z vaultu */
  const handleLoadStory = async (): Promise<boolean> => {
    if (!currentSceneId) return false
    try {
      const stored = await api.getSceneEntries(gameName, currentSceneId)
      const resolved = resolveEntries(stored, characters)
      setCharacters(resolved.characters)
      setStoryEntries(resolved.entries)
      return true
    } catch (error) {
      console.error('Načtení scény selhalo:', error)
      return false
    }
  }

  const handleRenameGame = async (): Promise<boolean> => {
    const input = window.prompt('Nové jméno hry (přejmenuje se i složka ve vaultu):', gameName)
    if (input === null) return false
    const newName = input.trim()
    if (!newName || newName === gameName) return false
    try {
      await api.renameGame(gameName, newName)
      navigate(`/story/${encodeURIComponent(newName)}`, { replace: true })
      return true
    } catch (error) {
      console.error('Přejmenování hry selhalo:', error)
      window.alert(error instanceof Error ? error.message : 'Přejmenování hry selhalo.')
      return false
    }
  }

  const handleClearStory = async (): Promise<boolean> => {
    if (!currentSceneId) return false
    try {
      await api.saveSceneEntries(gameName, currentSceneId, [])
      setStoryEntries([])
      return true
    } catch (error) {
      console.error('Vymazání scény selhalo:', error)
      return false
    }
  }

  const handleSelectScene = async (sceneId: string) => {
    if (sceneId === currentSceneId) return
    try {
      const stored = await api.getSceneEntries(gameName, sceneId)
      const resolved = resolveEntries(stored, characters)
      setCharacters(resolved.characters)
      setStoryEntries(resolved.entries)
      setCurrentSceneId(sceneId)
    } catch (error) {
      console.error('Načtení scény selhalo:', error)
    }
  }

  const handleCreateScene = async () => {
    const input = window.prompt('Název nové scény:', `Scéna ${scenes.length + 1}`)
    if (input === null) return
    const title = input.trim()
    if (!title) return
    try {
      const scene = await api.createScene(gameName, title)
      setScenes([...scenes, scene])
      setStoryEntries([])
      setCurrentSceneId(scene.id)
    } catch (error) {
      console.error('Vytvoření scény selhalo:', error)
    }
  }

  const handleDeleteScene = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene || scenes.length <= 1) return
    if (!window.confirm(`Opravdu smazat scénu „${scene.title}“ včetně jejího souboru ve vaultu?`)) return
    try {
      await api.deleteScene(gameName, sceneId)
      const remaining = scenes.filter(s => s.id !== sceneId)
      setScenes(remaining)
      if (sceneId === currentSceneId) {
        const fallback = remaining[remaining.length - 1]
        setCurrentSceneId(null)
        await handleSelectScene(fallback.id)
      }
    } catch (error) {
      console.error('Smazání scény selhalo:', error)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-black relative">
      {/* Pozadí celé aplikace */}
      <div
        className={`absolute inset-0 bg-no-repeat bg-center bg-cover pointer-events-none ${brightBackground ? 'opacity-90' : 'opacity-40'}`}
        style={{
          backgroundImage: displayBackground
            ? `url('${displayBackground}')`
            : `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"><rect fill="%23222" width="1200" height="600"/></svg>')`,
        }}
      />

      {/* Horní pás s postavami */}
      <CharacterBar
        characters={displayCharacters}
        showShortcutNumbers={showShortcutNumbers}
        onAddCharacter={handleAddCharacter}
        onCharacterImageDrop={handleCharacterImageDrop}
        onPortraitClick={handlePortraitClick}
        onCharacterNameChange={handleCharacterNameChange}
        onCharacterDelete={handleCharacterDelete}
        onBackgroundImageDrop={handleBackgroundImageDrop}
        onExportMarkdown={handleExportMarkdown}
        onSaveSetup={handleSaveSetup}
        onLoadSetup={handleLoadSetup}
        onLoadStory={handleLoadStory}
        onRenameGame={handleRenameGame}
        onEditDm={() => setShowDmSettings(true)}
        onClearStory={handleClearStory}
        onClearBackground={() => setBackgroundImage(null)}
        onShowBackground={() => {
          if (displayBackground) {
            setSelectedPortrait({ image: displayBackground, character: 'Pozadí' })
          }
        }}
      />

      <SceneBar
        scenes={scenes}
        currentSceneId={currentSceneId}
        onSelect={handleSelectScene}
        onCreate={handleCreateScene}
        onDelete={handleDeleteScene}
      />

      {loadError && (
        <div className="relative z-10 mx-4 mt-2 px-4 py-2 rounded-lg bg-red-900/70 border border-red-500 text-sm text-red-100">
          {loadError}
        </div>
      )}

      {/* Panel příběhu */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Obsah */}
        <div className="relative w-full flex flex-col">
          <StoryPanel entries={displayEntries} onPortraitClick={handlePortraitClick} onEntryDelete={handleEntryDelete} onEntryEdit={handleEntryEdit} darkenEntries={brightBackground} dmName={dmName} dmImage={displayDmImage} />
          <InputArea
            characters={displayCharacters}
            showShortcutNumbers={showShortcutNumbers}
            dmName={dmName}
            onAddEntry={handleAddEntry}
            brightBackground={brightBackground}
            onBrightBackgroundChange={setBrightBackground}
          />
        </div>
      </div>

      {/* Portrait Modal */}
      {selectedPortrait && (
        <PortraitModal
          image={selectedPortrait.image}
          character={selectedPortrait.character}
          onClose={() => setSelectedPortrait(null)}
        />
      )}

      {/* Nastavení vypravěče (DM) */}
      {showDmSettings && (
        <DmSettingsModal
          name={dmName}
          image={displayDmImage}
          onSave={handleDmSave}
          onClose={() => setShowDmSettings(false)}
        />
      )}
    </div>
  )
}
