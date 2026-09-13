import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Character, CharacterInput, GameSettings, GameSetup, ImageRef, SceneInput, SceneMeta, StoryEntry as ApiStoryEntry } from '@solo-rpg/shared'
import CharacterBar from '../components/CharacterBar'
import StoryPanel from '../components/StoryPanel'
import InputArea from '../components/InputArea'
import PortraitModal from '../components/PortraitModal'
import DmSettingsModal from '../components/DmSettingsModal'
import CharacterModal, { type CharacterFormValues } from '../components/CharacterModal'
import SceneModal, { type SceneFormValues } from '../components/SceneModal'
import SceneBar from '../components/SceneBar'
import * as api from '../utils/api'
import { assetUrl } from '../utils/api'

/** Postava s obrázkem převedeným na URL použitelnou v <img> */
interface DisplayCharacter {
  id: string
  name: string
  nickname: string
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

type CharacterModalState = { mode: 'create' } | { mode: 'edit'; id: string }
type SceneModalState = { mode: 'create' } | { mode: 'edit'; id: string }

const SETUP_AUTOSAVE_MS = 600

/** Mluvčí dopsaný ručně ve scéně, který zatím nemá soubor postavy (není uložen, dokud ho uživatel nevytvoří) */
const isEphemeral = (character: Character) => character.id.startsWith('tmp-')

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
  const [characterModal, setCharacterModal] = useState<CharacterModalState | null>(null)
  const [sceneModal, setSceneModal] = useState<SceneModalState | null>(null)
  const [showShortcutNumbers, setShowShortcutNumbers] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Autosave nastavení spouštíme až po prvním načtení ze serveru
  const setupLoadedRef = useRef(false)
  const lastSavedSetupRef = useRef<string>('')

  const toDisplay = useCallback(
    (c: Character): DisplayCharacter => ({ id: c.id, name: c.name, nickname: c.nickname, image: assetUrl(gameName, c.image) }),
    [gameName]
  )
  const currentScene = useMemo(() => scenes.find(s => s.id === currentSceneId) ?? null, [scenes, currentSceneId])
  // V pásu a při psaní jen postavy aktuální scény (+ dočasní mluvčí, kteří v ní mluví)
  const displayCharacters = useMemo(() => {
    const inScene = new Set(currentScene?.characters ?? [])
    const speaking = new Set(storyEntries.map(e => e.character?.id))
    return characters.filter(c => inScene.has(c.name) || (isEphemeral(c) && speaking.has(c.id))).map(toDisplay)
  }, [characters, currentScene, storyEntries, toDisplay])
  const displayEntries = useMemo(
    () => storyEntries.map(e => ({ ...e, character: e.character ? toDisplay(e.character) : null })),
    [storyEntries, toDisplay]
  )
  const sceneCharacterOptions = useMemo(
    () => characters.filter(c => !isEphemeral(c)).map(c => ({ name: c.name, nickname: c.nickname, image: assetUrl(gameName, c.image) })),
    [characters, gameName]
  )
  const editingScene = useMemo(
    () => (sceneModal?.mode === 'edit' ? scenes.find(s => s.id === sceneModal.id) ?? null : null),
    [sceneModal, scenes]
  )
  // Obrázek scény má přednost před pozadím hry
  const displayBackground = assetUrl(gameName, currentScene?.image ?? backgroundImage)
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

  /** Položky scény z API → položky s odkazem na postavu (neznámí mluvčí dostanou dočasnou postavu bez souboru) */
  const resolveEntries = useCallback((stored: ApiStoryEntry[], knownCharacters: Character[]) => {
    const updated = [...knownCharacters]
    const entries: StoryEntry[] = stored.map(e => {
      let character: Character | null = null
      if (e.characterName !== null) {
        const speaker = e.characterName
        character = updated.find(c => c.name === speaker) ?? updated.find(c => c.nickname === speaker) ?? null
        if (!character) {
          character = { id: `tmp-${speaker}`, name: speaker, firstName: speaker, lastName: '', nickname: speaker, image: null, notes: '' }
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
    const settings: GameSettings = { backgroundImage: setup.backgroundImage, brightBackground: setup.brightBackground, dm: setup.dm }
    lastSavedSetupRef.current = JSON.stringify(settings)
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
        // Hra bez scén → nejdřív vytvořit první scénu
        if (!scene) setSceneModal({ mode: 'create' })
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

  const currentSettings = useMemo<GameSettings>(
    () => ({ backgroundImage, brightBackground, dm: { name: dmName, image: dmImage } }),
    [backgroundImage, brightBackground, dmName, dmImage]
  )

  // Automatické ukládání nastavení (pozadí, DM) do vaultu – postavy mají vlastní endpointy
  useEffect(() => {
    if (!setupLoadedRef.current) return
    const serialized = JSON.stringify(currentSettings)
    if (serialized === lastSavedSetupRef.current) return
    const timer = setTimeout(() => {
      api.saveSetup(gameName, currentSettings)
        .then(() => { lastSavedSetupRef.current = serialized })
        .catch(error => console.error('Automatické uložení nastavení selhalo:', error))
    }, SETUP_AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [currentSettings, gameName])

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

  const handleAddCharacter = () => setCharacterModal({ mode: 'create' })

  const editingCharacter = useMemo(
    () => (characterModal?.mode === 'edit' ? characters.find(c => c.id === characterModal.id) ?? null : null),
    [characterModal, characters]
  )

  /** Nahradí postavu ve stavu i v položkách příběhu (po úpravě / vytvoření z dočasné postavy) */
  const replaceCharacter = (oldId: string, saved: Character): StoryEntry[] => {
    setCharacters(prev => prev.map(c => (c.id === oldId ? saved : c)))
    const updatedEntries = storyEntries.map(e => (e.character?.id === oldId ? { ...e, character: saved } : e))
    setStoryEntries(updatedEntries)
    return updatedEntries
  }

  /** Přidá postavu do seznamu postav aktuální scény (uloží do souboru scény) */
  const addCharacterToCurrentScene = async (name: string) => {
    const scene = currentScene
    if (!scene || scene.characters.includes(name)) return
    const saved = await api.updateScene(gameName, scene.id, { title: scene.title, characters: [...scene.characters, name] })
    setScenes(prev => prev.map(s => (s.id === saved.id ? saved : s)))
  }

  /** Submit dialogu postavy: vytvoří/aktualizuje soubor postavy a uloží portrét */
  const handleCharacterSubmit = async (values: CharacterFormValues) => {
    const editing = editingCharacter
    const persisted = editing !== null && !isEphemeral(editing)
    const base: CharacterInput = { firstName: values.firstName, lastName: values.lastName, nickname: values.nickname, notes: values.notes }

    // Nejdřív postava (kontrola duplicitního jména), teprve pak portrét pod jejím celým jménem
    let saved = persisted
      ? await api.updateCharacter(gameName, editing.id, { ...base, image: values.image === null ? null : undefined })
      : await api.createCharacter(gameName, base)

    if (values.image) {
      const ref = await api.storeImage(gameName, 'portrait', values.image, saved.name)
      saved = await api.updateCharacter(gameName, saved.id, { ...base, image: ref })
    }

    if (editing) {
      const updatedEntries = replaceCharacter(editing.id, saved)
      // Dočasná postava vznikla z ručně dopsané repliky – scénu přepsat na odkaz na nový soubor
      if (!persisted) persistStory(updatedEntries)
      // BE přepsal jméno i v seznamech postav scén → promítnout do stavu
      if (persisted && editing.name !== saved.name) {
        setScenes(prev => prev.map(s => ({ ...s, characters: s.characters.map(n => (n === editing.name ? saved.name : n)) })))
      }
    } else {
      setCharacters(prev => [...prev, saved])
    }
    // Nová postava (i z dočasné) patří do scény, ve které vznikla
    if (!persisted) await addCharacterToCurrentScene(saved.name)
  }

  /** Nová postava z dialogu scény – do scény ji přidá checklist při submitu, ne aktuální scéna */
  const createCharacterFromSceneModal = async (values: CharacterFormValues) => {
    const base: CharacterInput = { firstName: values.firstName, lastName: values.lastName, nickname: values.nickname, notes: values.notes }
    let saved = await api.createCharacter(gameName, base)
    if (values.image) {
      const ref = await api.storeImage(gameName, 'portrait', values.image, saved.name)
      saved = await api.updateCharacter(gameName, saved.id, { ...base, image: ref })
    }
    setCharacters(prev => [...prev, saved])
    return { name: saved.name, nickname: saved.nickname, image: assetUrl(gameName, saved.image) }
  }

  const deleteCharacter = async (characterId: string) => {
    const character = characters.find(c => c.id === characterId)
    if (!character) return
    if (!isEphemeral(character)) await api.deleteCharacter(gameName, characterId)
    setCharacters(prev => prev.filter(c => c.id !== characterId))
    setScenes(prev => prev.map(s => ({ ...s, characters: s.characters.filter(n => n !== character.name) })))
  }

  const handleCharacterImageDrop = async (characterId: string, file: File) => {
    const character = characters.find(c => c.id === characterId)
    if (!character) return
    if (isEphemeral(character)) {
      setCharacterModal({ mode: 'edit', id: characterId })
      return
    }
    try {
      const ref = await api.storeImage(gameName, 'portrait', file, character.name)
      const saved = await api.updateCharacter(gameName, characterId, {
        firstName: character.firstName,
        lastName: character.lastName,
        nickname: character.nickname,
        notes: character.notes,
        image: ref,
      })
      replaceCharacter(characterId, saved)
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

  const handleCharacterDelete = (characterId: string) => {
    deleteCharacter(characterId).catch(error => console.error('Smazání postavy selhalo:', error))
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
      .map(entry => `**${entry.character ? entry.character.nickname : dmName}**:${entry.markdown ? '\n' : ' '}${entry.text}`)
      .join('\n\n')

  const handleSaveSetup = async (): Promise<boolean> => {
    try {
      const saved = await api.saveSetup(gameName, currentSettings)
      applySetup(saved)
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

  const handleCreateScene = () => setSceneModal({ mode: 'create' })

  /** Submit dialogu scény: vytvoří/aktualizuje soubor scény a uloží její obrázek pod jejím názvem */
  const handleSceneSubmit = async (values: SceneFormValues) => {
    const editing = editingScene
    const base: SceneInput = { title: values.title, description: values.description, characters: values.characters }

    // Nejdřív scéna (kontrola duplicitního názvu), teprve pak obrázek pojmenovaný podle ní
    let saved = editing
      ? await api.updateScene(gameName, editing.id, { ...base, image: values.image === null ? null : undefined })
      : await api.createScene(gameName, base)

    if (values.image) {
      const ref = await api.storeImage(gameName, 'scene', values.image, saved.title)
      saved = await api.updateScene(gameName, saved.id, { ...base, image: ref })
    }

    if (editing) {
      setScenes(prev => prev.map(s => (s.id === saved.id ? saved : s)))
    } else {
      setScenes(prev => [...prev, saved])
      setStoryEntries([])
      setCurrentSceneId(saved.id)
    }
  }

  const deleteScene = async (sceneId: string) => {
    await api.deleteScene(gameName, sceneId)
    const remaining = scenes.filter(s => s.id !== sceneId)
    setScenes(remaining)
    if (sceneId === currentSceneId) {
      const fallback = remaining[remaining.length - 1]
      setCurrentSceneId(null)
      setStoryEntries([])
      if (fallback) await handleSelectScene(fallback.id)
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
        onCharacterClick={(id) => setCharacterModal({ mode: 'edit', id })}
        onCharacterImageDrop={handleCharacterImageDrop}
        onCharacterDelete={handleCharacterDelete}
        onExportMarkdown={handleExportMarkdown}
        onSaveSetup={handleSaveSetup}
        onLoadSetup={handleLoadSetup}
        onLoadStory={handleLoadStory}
        onRenameGame={handleRenameGame}
        onEditDm={() => setShowDmSettings(true)}
        onClearStory={handleClearStory}
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
        onEdit={(id) => setSceneModal({ mode: 'edit', id })}
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

      {/* Vytvoření / úprava postavy */}
      {characterModal && (
        <CharacterModal
          key={characterModal.mode === 'edit' ? characterModal.id : 'new'}
          character={editingCharacter}
          image={editingCharacter ? assetUrl(gameName, editingCharacter.image) : null}
          onSubmit={handleCharacterSubmit}
          onDelete={editingCharacter ? () => deleteCharacter(editingCharacter.id) : undefined}
          onClose={() => setCharacterModal(null)}
        />
      )}
      {/* Vytvoření / úprava scény; bez scén je dialog povinný */}
      {sceneModal && (
        <SceneModal
          key={sceneModal.mode === 'edit' ? sceneModal.id : 'new'}
          scene={editingScene}
          image={editingScene ? assetUrl(gameName, editingScene.image) : null}
          defaultTitle={`Scéna ${scenes.length + 1}`}
          defaultCharacters={scenes.length > 0 ? scenes[scenes.length - 1].characters : sceneCharacterOptions.map(c => c.name)}
          allCharacters={sceneCharacterOptions}
          required={scenes.length === 0}
          onSubmit={handleSceneSubmit}
          onCreateCharacter={createCharacterFromSceneModal}
          onDelete={editingScene ? () => deleteScene(editingScene.id) : undefined}
          onClose={() => setSceneModal(null)}
        />
      )}
    </div>
  )
}
