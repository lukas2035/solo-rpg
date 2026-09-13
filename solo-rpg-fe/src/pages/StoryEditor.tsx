import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Character, CharacterInput, Faction, FactionInput, FactionStance, GameSettings, GameSetup, ImageRef, Narrator, NarratorInput, SceneInput, SceneMeta, StoryEntry as ApiStoryEntry, StoryThread, ThreadInput, ThreadStatus } from '@solo-rpg/shared'
import CharacterBar from '../components/CharacterBar'
import StoryPanel from '../components/StoryPanel'
import InputArea from '../components/InputArea'
import PortraitModal from '../components/PortraitModal'
import NarratorPickerModal from '../components/NarratorPickerModal'
import NarratorModal, { type NarratorFormValues } from '../components/NarratorModal'
import CharacterModal, { type CharacterFormValues } from '../components/CharacterModal'
import SceneModal, { type SceneFormValues } from '../components/SceneModal'
import SceneBar from '../components/SceneBar'
import ThreadsPanel from '../components/ThreadsPanel'
import ThreadModal from '../components/ThreadModal'
import FactionsPanel, { type DisplayFaction } from '../components/FactionsPanel'
import FactionModal, { type FactionFormValues, type IncomingRelation } from '../components/FactionModal'
import SidePanel, { type SidePanelTab } from '../components/SidePanel'
import type { EntityOption } from '../components/EntityChecklist'
import * as api from '../utils/api'
import { assetUrl, useAssetVersion } from '../utils/api'
import { FACTION_TYPE_ICONS } from '../utils/factions'

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
  /** Vypravěč záznamu (jen když `character` je null); null = starý zápis bez odkazu na vypravěče */
  narrator: Narrator | null
  text: string
  timestamp: number
  /** Text je víceřádkový markdown */
  markdown?: boolean
}

type CharacterModalState = { mode: 'create' } | { mode: 'edit'; id: string }
type SceneModalState = { mode: 'create' } | { mode: 'edit'; id: string }
type NarratorModalState = { mode: 'create' } | { mode: 'edit'; id: string }
type ThreadModalState = { mode: 'create' } | { mode: 'edit'; id: string }
type FactionModalState = { mode: 'create' } | { mode: 'edit'; id: string }

const SETUP_AUTOSAVE_MS = 600

/** Mluvčí dopsaný ručně ve scéně, který zatím nemá soubor postavy (není uložen, dokud ho uživatel nevytvoří) */
const isEphemeral = (character: Character) => character.id.startsWith('tmp-')

export default function StoryEditor() {
  const { storyId } = useParams()
  const navigate = useNavigate()
  // Jméno hry z URL = název složky ve vaultu
  const gameName = decodeURIComponent(storyId ?? 'Bez názvu')

  const [characters, setCharacters] = useState<Character[]>([])
  const [narrators, setNarrators] = useState<Narrator[]>([])
  const [storyEntries, setStoryEntries] = useState<StoryEntry[]>([])
  const [scenes, setScenes] = useState<SceneMeta[]>([])
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null)

  const [selectedPortrait, setSelectedPortrait] = useState<{ image: string; character: string } | null>(null)
  const [backgroundImage, setBackgroundImage] = useState<ImageRef>(null)
  const [brightBackground, setBrightBackground] = useState(true)
  /** Jméno aktuálního vypravěče; null = hra vypravěče nemá */
  const [narratorName, setNarratorName] = useState<string | null>(null)
  const [showNarratorPicker, setShowNarratorPicker] = useState(false)
  const [narratorModal, setNarratorModal] = useState<NarratorModalState | null>(null)
  const [characterModal, setCharacterModal] = useState<CharacterModalState | null>(null)
  const [sceneModal, setSceneModal] = useState<SceneModalState | null>(null)
  const [threads, setThreads] = useState<StoryThread[]>([])
  const [sidePanel, setSidePanel] = useState<SidePanelTab | null>(null)
  const [threadModal, setThreadModal] = useState<ThreadModalState | null>(null)
  const [factions, setFactions] = useState<Faction[]>([])
  const [factionModal, setFactionModal] = useState<FactionModalState | null>(null)
  const [showShortcutNumbers, setShowShortcutNumbers] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Cesty souborů změněných mimo aplikaci; null = žádné nevyřízené změny */
  const [vaultChanges, setVaultChanges] = useState<string[] | null>(null)

  // Sledování změn ve složce hry (SSE z BE)
  useEffect(() => {
    return api.subscribeVaultChanges(gameName, paths => {
      setVaultChanges(prev => [...new Set([...(prev ?? []), ...paths])])
    })
  }, [gameName])

  // Autosave nastavení spouštíme až po prvním načtení ze serveru
  const setupLoadedRef = useRef(false)
  const lastSavedSetupRef = useRef<string>('')

  const assetVersion = useAssetVersion()
  const toDisplay = useCallback(
    (c: Character): DisplayCharacter => ({ id: c.id, name: c.name, nickname: c.nickname, image: assetUrl(gameName, c.image, assetVersion) }),
    [gameName, assetVersion]
  )
  const currentScene = useMemo(() => scenes.find(s => s.id === currentSceneId) ?? null, [scenes, currentSceneId])
  // V pásu a při psaní jen postavy aktuální scény (+ dočasní mluvčí, kteří v ní mluví)
  const displayCharacters = useMemo(() => {
    const inScene = new Set(currentScene?.characters ?? [])
    const speaking = new Set(storyEntries.map(e => e.character?.id))
    return characters.filter(c => inScene.has(c.name) || (isEphemeral(c) && speaking.has(c.id))).map(toDisplay)
  }, [characters, currentScene, storyEntries, toDisplay])
  const displayEntries = useMemo(
    () => storyEntries.map(e => ({
      ...e,
      character: e.character ? toDisplay(e.character) : null,
      narrator: e.narrator ? { id: e.narrator.id, name: e.narrator.name, image: assetUrl(gameName, e.narrator.image, assetVersion) } : null,
    })),
    [storyEntries, toDisplay, gameName, assetVersion]
  )
  const displayNarrators = useMemo(
    () => narrators.map(n => ({ id: n.id, name: n.name, description: n.description, image: assetUrl(gameName, n.image, assetVersion) })),
    [narrators, gameName, assetVersion]
  )
  const currentNarrator = useMemo(() => narrators.find(n => n.name === narratorName) ?? null, [narrators, narratorName])
  const editingNarrator = useMemo(
    () => (narratorModal?.mode === 'edit' ? narrators.find(n => n.id === narratorModal.id) ?? null : null),
    [narratorModal, narrators]
  )
  const sceneCharacterOptions = useMemo(
    () => characters.filter(c => !isEphemeral(c)).map(c => ({ name: c.name, nickname: c.nickname, image: assetUrl(gameName, c.image, assetVersion) })),
    [characters, gameName, assetVersion]
  )
  const editingThread = useMemo(
    () => (threadModal?.mode === 'edit' ? threads.find(t => t.id === threadModal.id) ?? null : null),
    [threadModal, threads]
  )
  const openThreadCount = useMemo(() => threads.filter(t => t.status === 'latent' || t.status === 'active' || t.status === 'escalated').length, [threads])
  /** Postavy pro checklisty v dialozích nití a frakcí */
  const characterOptions = useMemo<EntityOption[]>(
    () => sceneCharacterOptions.map(c => ({ name: c.name, label: c.nickname, image: c.image })),
    [sceneCharacterOptions]
  )
  const factionOptions = useMemo<EntityOption[]>(
    () => factions.map(f => ({ name: f.title, label: f.title, image: assetUrl(gameName, f.emblem, assetVersion), icon: FACTION_TYPE_ICONS[f.type] })),
    [factions, gameName, assetVersion]
  )
  const displayFactions = useMemo<DisplayFaction[]>(
    () => factions.map(f => ({
      ...f,
      emblemUrl: assetUrl(gameName, f.emblem, assetVersion),
      openThreadCount: threads.filter(t => t.factions.includes(f.title) && (t.status === 'latent' || t.status === 'active' || t.status === 'escalated')).length,
      leaderLabel: f.leader ? characters.find(c => c.name === f.leader)?.nickname ?? f.leader : null,
    })),
    [factions, threads, characters, gameName, assetVersion]
  )
  const activeFactionCount = useMemo(() => factions.filter(f => f.status === 'active').length, [factions])
  const editingFaction = useMemo(
    () => (factionModal?.mode === 'edit' ? factions.find(f => f.id === factionModal.id) ?? null : null),
    [factionModal, factions]
  )
  // Dopočítané vazby pro detail frakce (nikam se neukládají)
  const factionSubfactions = useMemo(() => (editingFaction ? factions.filter(f => f.parentFaction === editingFaction.title) : []), [factions, editingFaction])
  const factionIncomingRelations = useMemo<IncomingRelation[]>(
    () => (editingFaction
      ? factions.flatMap(f => f.relations.filter(r => r.faction === editingFaction.title).map(relation => ({ from: f, relation })))
      : []),
    [factions, editingFaction]
  )
  const factionThreads = useMemo(() => (editingFaction ? threads.filter(t => t.factions.includes(editingFaction.title)) : []), [threads, editingFaction])
  const editingScene = useMemo(
    () => (sceneModal?.mode === 'edit' ? scenes.find(s => s.id === sceneModal.id) ?? null : null),
    [sceneModal, scenes]
  )
  // Obrázek scény má přednost před pozadím hry
  const displayBackground = assetUrl(gameName, currentScene?.image ?? backgroundImage, assetVersion)

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

  /** Položky scény z API → položky s odkazem na postavu / vypravěče (neznámí mluvčí dostanou dočasnou postavu bez souboru) */
  const resolveEntries = useCallback((stored: ApiStoryEntry[], knownCharacters: Character[], knownNarrators: Narrator[]) => {
    const updated = [...knownCharacters]
    const entries: StoryEntry[] = stored.map(e => {
      let character: Character | null = null
      let narrator: Narrator | null = null
      if (e.characterName !== null) {
        const speaker = e.characterName
        character = updated.find(c => c.name === speaker) ?? updated.find(c => c.nickname === speaker) ?? null
        if (!character) {
          character = { id: `tmp-${speaker}`, name: speaker, firstName: speaker, lastName: '', nickname: speaker, image: null, notes: '' }
          updated.push(character)
        }
      } else if (e.narratorName) {
        narrator = knownNarrators.find(n => n.name === e.narratorName) ?? null
      }
      return { id: e.id, character, narrator, text: e.text, timestamp: e.timestamp, markdown: e.markdown }
    })
    return { entries, characters: updated }
  }, [])

  const applySetup = useCallback((setup: GameSetup) => {
    setBackgroundImage(setup.backgroundImage)
    setBrightBackground(setup.brightBackground)
    setNarrators(setup.narrators)
    setNarratorName(setup.narrator)
    const settings: GameSettings = { backgroundImage: setup.backgroundImage, brightBackground: setup.brightBackground, narrator: setup.narrator }
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

        const resolved = resolveEntries(stored, detail.setup.characters, detail.setup.narrators)
        setCharacters(resolved.characters)
        setStoryEntries(resolved.entries)
        setScenes(detail.scenes)
        setThreads(detail.threads)
        setFactions(detail.factions)
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
    () => ({ backgroundImage, brightBackground, narrator: narratorName }),
    [backgroundImage, brightBackground, narratorName]
  )

  // Automatické ukládání nastavení (pozadí, aktuální vypravěč) do vaultu – postavy a vypravěči mají vlastní endpointy
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
      narratorName: e.character ? undefined : e.narrator?.name ?? null,
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
        setThreads(prev => prev.map(t => ({ ...t, characters: t.characters.map(n => (n === editing.name ? saved.name : n)) })))
        setFactions(prev => prev.map(f => ({
          ...f,
          leader: f.leader === editing.name ? saved.name : f.leader,
          characters: f.characters.map(n => (n === editing.name ? saved.name : n)),
        })))
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
    setThreads(prev => prev.map(t => ({ ...t, characters: t.characters.filter(n => n !== character.name) })))
    setFactions(prev => prev.map(f => ({
      ...f,
      leader: f.leader === character.name ? null : f.leader,
      characters: f.characters.filter(n => n !== character.name),
    })))
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
    // Text vypravěče jen s existujícím vypravěčem (InputArea to hlídá, tady pojistka)
    if (!selectedCharacter && !currentNarrator) return

    const newEntry: StoryEntry = {
      id: Date.now().toString(),
      character: selectedCharacter || null,
      narrator: selectedCharacter ? null : currentNarrator,
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

  /** Submit dialogu vypravěče: vytvoří/aktualizuje soubor vypravěče a uloží portrét pod jeho jménem */
  const handleNarratorSubmit = async (values: NarratorFormValues) => {
    const editing = editingNarrator
    const base: NarratorInput = { name: values.name, description: values.description }

    // Nejdřív vypravěč (kontrola duplicitního jména), teprve pak portrét pod jeho jménem
    let saved = editing
      ? await api.updateNarrator(gameName, editing.id, { ...base, image: values.image === null ? null : undefined })
      : await api.createNarrator(gameName, base)

    if (values.image) {
      const ref = await api.storeImage(gameName, 'narrator', values.image, saved.name)
      saved = await api.updateNarrator(gameName, saved.id, { ...base, image: ref })
    }

    if (editing) {
      setNarrators(prev => prev.map(n => (n.id === saved.id ? saved : n)))
      setStoryEntries(prev => prev.map(e => (e.narrator?.id === saved.id ? { ...e, narrator: saved } : e)))
      // BE přepsal jméno i v game.md a ve scénách → promítnout do stavu
      if (narratorName === editing.name) {
        setNarratorName(saved.name)
        lastSavedSetupRef.current = JSON.stringify({ ...currentSettings, narrator: saved.name })
      }
    } else {
      setNarrators(prev => [...prev, saved])
      // První vypravěč hry se rovnou stane aktuálním
      if (narratorName === null) setNarratorName(saved.name)
    }
  }

  const deleteNarrator = async (narratorId: string) => {
    const narrator = narrators.find(n => n.id === narratorId)
    if (!narrator) return
    await api.deleteNarrator(gameName, narratorId)
    setNarrators(prev => prev.filter(n => n.id !== narratorId))
    if (narratorName === narrator.name) {
      // BE už aktuálního vypravěče v game.md vynuloval
      setNarratorName(null)
      lastSavedSetupRef.current = JSON.stringify({ ...currentSettings, narrator: null })
    }
  }

  const handleSelectNarrator = (narratorId: string) => {
    const narrator = narrators.find(n => n.id === narratorId)
    if (narrator) setNarratorName(narrator.name)
    setShowNarratorPicker(false)
  }

  const handleExportMarkdown = () =>
    storyEntries
      // U víceřádkového markdownu začíná text na novém řádku pod jménem mluvčího
      .map(entry => `**${entry.character ? entry.character.nickname : entry.narrator?.name ?? 'Vypravěč'}**:${entry.markdown ? '\n' : ' '}${entry.text}`)
      .join('\n\n')

  /** Znovu načte celou hru z vaultu (nastavení, postavy, scény i záznamy aktuální scény) – po změnách v Obsidianu */
  const reloadFromVault = async (): Promise<boolean> => {
    try {
      const detail = await api.getGame(gameName)
      const scene = detail.scenes.find(s => s.id === currentSceneId) ?? detail.scenes[detail.scenes.length - 1] ?? null
      const stored = scene ? await api.getSceneEntries(gameName, scene.id) : []
      const resolved = resolveEntries(stored, detail.setup.characters, detail.setup.narrators)
      setCharacters(resolved.characters)
      setStoryEntries(resolved.entries)
      setScenes(detail.scenes)
      setThreads(detail.threads)
      setFactions(detail.factions)
      setCurrentSceneId(scene?.id ?? null)
      applySetup({ ...detail.setup, characters: resolved.characters })
      setVaultChanges(null)
      // obrázky mohly být přepsány v Obsidianu se stejným názvem
      api.bumpAssetVersion()
      if (!scene) setSceneModal({ mode: 'create' })
      return true
    } catch (error) {
      console.error('Načtení z vaultu selhalo:', error)
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
      const resolved = resolveEntries(stored, characters, narrators)
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
      // BE přepsal odkaz na scénu i v nitích
      if (editing.title !== saved.title) {
        setThreads(prev => prev.map(t => (t.scene === editing.title ? { ...t, scene: saved.title } : t)))
      }
    } else {
      setScenes(prev => [...prev, saved])
      setStoryEntries([])
      setCurrentSceneId(saved.id)
    }
  }

  const deleteScene = async (sceneId: string) => {
    const deleted = scenes.find(s => s.id === sceneId)
    await api.deleteScene(gameName, sceneId)
    const remaining = scenes.filter(s => s.id !== sceneId)
    setScenes(remaining)
    if (deleted) setThreads(prev => prev.map(t => (t.scene === deleted.title ? { ...t, scene: null } : t)))
    if (sceneId === currentSceneId) {
      const fallback = remaining[remaining.length - 1]
      setCurrentSceneId(null)
      setStoryEntries([])
      if (fallback) await handleSelectScene(fallback.id)
    }
  }

  // ---------- dějové nitě ----------

  const upsertThread = (saved: StoryThread) =>
    setThreads(prev => (prev.some(t => t.id === saved.id) ? prev.map(t => (t.id === saved.id ? saved : t)) : [saved, ...prev]))

  const handleThreadSubmit = async (input: ThreadInput) => {
    const saved = editingThread
      ? await api.updateThread(gameName, editingThread.id, input)
      : await api.createThread(gameName, input)
    upsertThread(saved)
  }

  const deleteThread = async (threadId: string) => {
    await api.deleteThread(gameName, threadId)
    setThreads(prev => prev.filter(t => t.id !== threadId))
  }

  /** Částečná úprava nitě přímo ze seznamu (stav, hodiny) – posílá se celá nit, BE ukládá soubor jako celek */
  const patchThread = async (thread: StoryThread, patch: Partial<ThreadInput>) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = thread
    try {
      upsertThread(await api.updateThread(gameName, thread.id, { ...rest, ...patch }))
    } catch (error) {
      console.error('Úprava dějové nitě selhala:', error)
    }
  }

  const handleThreadStatusChange = (thread: StoryThread, status: ThreadStatus) => void patchThread(thread, { status })

  const handleThreadClockStep = (thread: StoryThread, delta: 1 | -1) => {
    if (!thread.clock) return
    const current = Math.min(thread.clock.max, Math.max(0, thread.clock.current + delta))
    if (current === thread.clock.current) return
    void patchThread(thread, { clock: { current, max: thread.clock.max } })
  }

  // ---------- frakce ----------

  const upsertFaction = (saved: Faction) =>
    setFactions(prev => (prev.some(f => f.id === saved.id) ? prev.map(f => (f.id === saved.id ? saved : f)) : [...prev, saved]))

  /** Po přejmenování frakce promítnout nový název do vazeb ostatních frakcí a nití (BE to udělal v souborech) */
  const renameFactionLocally = (oldTitle: string, newTitle: string) => {
    setFactions(prev => prev.map(f => ({
      ...f,
      parentFaction: f.parentFaction === oldTitle ? newTitle : f.parentFaction,
      relations: f.relations.map(r => (r.faction === oldTitle ? { ...r, faction: newTitle } : r)),
    })))
    setThreads(prev => prev.map(t => ({ ...t, factions: t.factions.map(n => (n === oldTitle ? newTitle : n)) })))
  }

  const handleFactionSubmit = async (values: FactionFormValues) => {
    const editing = editingFaction
    const base: FactionInput = {
      title: values.title,
      type: values.type,
      status: values.status,
      stance: values.stance,
      leader: values.leader,
      parentFaction: values.parentFaction,
      goals: values.goals,
      characters: values.characters,
      relations: values.relations,
      description: values.description,
      secrets: values.secrets,
    }
    // Nejdřív frakce (kontrola duplicitního názvu), teprve pak emblém pojmenovaný podle ní
    let saved = editing
      ? await api.updateFaction(gameName, editing.id, { ...base, emblem: values.emblem === null ? null : undefined })
      : await api.createFaction(gameName, base)
    if (values.emblem) {
      const ref = await api.storeImage(gameName, 'faction', values.emblem, saved.title)
      saved = await api.updateFaction(gameName, saved.id, { ...base, emblem: ref })
    }
    upsertFaction(saved)
    if (editing && editing.title !== saved.title) renameFactionLocally(editing.title, saved.title)
  }

  const deleteFaction = async (factionId: string) => {
    const faction = factions.find(f => f.id === factionId)
    await api.deleteFaction(gameName, factionId)
    setFactions(prev => prev
      .filter(f => f.id !== factionId)
      .map(f => (faction ? {
        ...f,
        parentFaction: f.parentFaction === faction.title ? null : f.parentFaction,
        relations: f.relations.filter(r => r.faction !== faction.title),
      } : f)))
    if (faction) setThreads(prev => prev.map(t => ({ ...t, factions: t.factions.filter(n => n !== faction.title) })))
  }

  const handleFactionStanceChange = async (faction: Faction, stance: FactionStance) => {
    const { id: _id, createdAt: _c, updatedAt: _u, emblem: _e, ...rest } = faction
    try {
      upsertFaction(await api.updateFaction(gameName, faction.id, { ...rest, stance }))
    } catch (error) {
      console.error('Úprava frakce selhala:', error)
    }
  }

  /** Z detailu frakce přeskočit na jinou frakci / nit (zavře aktuální dialog) */
  const openFaction = (faction: Faction) => { setThreadModal(null); setFactionModal({ mode: 'edit', id: faction.id }) }
  const openThread = (thread: StoryThread) => { setFactionModal(null); setThreadModal({ mode: 'edit', id: thread.id }) }

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
        onRenameGame={handleRenameGame}
        onSelectNarrator={() => setShowNarratorPicker(true)}
        onToggleThreads={() => setSidePanel(p => (p === 'threads' ? null : 'threads'))}
        onToggleFactions={() => setSidePanel(p => (p === 'factions' ? null : 'factions'))}
        threadsOpen={sidePanel === 'threads'}
        factionsOpen={sidePanel === 'factions'}
        openThreadCount={openThreadCount}
        activeFactionCount={activeFactionCount}
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

      {/* Soubory hry se změnily mimo aplikaci (Obsidian, průzkumník…) */}
      {vaultChanges && (
        <div
          className="relative z-10 mx-4 mt-2 px-4 py-2 rounded-lg bg-amber-900/70 border border-amber-500 text-sm text-amber-100 flex items-center gap-3"
          title={vaultChanges.join('\n')}
        >
          <span className="flex-1">
            Došlo ke změně v souborech hry ve vaultu ({vaultChanges.length}{' '}
            {vaultChanges.length === 1 ? 'soubor' : vaultChanges.length < 5 ? 'soubory' : 'souborů'}). Neuložené úpravy v aplikaci se načtením přepíšou.
          </span>
          <button
            type="button"
            onClick={() => void reloadFromVault()}
            className="px-3 py-1 rounded-md bg-amber-500 text-black font-semibold hover:opacity-80 transition-opacity"
          >
            Načíst aktuální stav
          </button>
          <button
            type="button"
            onClick={() => setVaultChanges(null)}
            title="Skrýt upozornění"
            className="px-2 py-1 rounded-md border border-amber-400/60 hover:border-amber-300 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Panel příběhu */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Obsah */}
        <div className="relative w-full flex flex-col">
          <StoryPanel entries={displayEntries} onPortraitClick={handlePortraitClick} onEntryDelete={handleEntryDelete} onEntryEdit={handleEntryEdit} darkenEntries={brightBackground} />
          <InputArea
            characters={displayCharacters}
            showShortcutNumbers={showShortcutNumbers}
            narratorName={currentNarrator?.name ?? null}
            onCreateNarrator={() => setNarratorModal({ mode: 'create' })}
            onAddEntry={handleAddEntry}
            brightBackground={brightBackground}
            onBrightBackgroundChange={setBrightBackground}
          />
        </div>

        {/* Postranní panel kampaně: dějové nitě | frakce */}
        {sidePanel && (
          <SidePanel tab={sidePanel} onTabChange={setSidePanel} counts={{ threads: openThreadCount, factions: activeFactionCount }} onClose={() => setSidePanel(null)}>
            {sidePanel === 'threads' ? (
              <ThreadsPanel
                threads={threads}
                onCreate={() => setThreadModal({ mode: 'create' })}
                onEdit={(t) => setThreadModal({ mode: 'edit', id: t.id })}
                onStatusChange={handleThreadStatusChange}
                onClockStep={handleThreadClockStep}
              />
            ) : (
              <FactionsPanel
                factions={displayFactions}
                onCreate={() => setFactionModal({ mode: 'create' })}
                onEdit={(f) => setFactionModal({ mode: 'edit', id: f.id })}
                onStanceChange={handleFactionStanceChange}
              />
            )}
          </SidePanel>
        )}
      </div>

      {/* Portrait Modal */}
      {selectedPortrait && (
        <PortraitModal
          image={selectedPortrait.image}
          character={selectedPortrait.character}
          onClose={() => setSelectedPortrait(null)}
        />
      )}

      {/* Výběr aktuálního vypravěče */}
      {showNarratorPicker && (
        <NarratorPickerModal
          narrators={displayNarrators}
          currentId={currentNarrator?.id ?? null}
          onSelect={handleSelectNarrator}
          onEdit={(id) => setNarratorModal({ mode: 'edit', id })}
          onCreate={() => setNarratorModal({ mode: 'create' })}
          onClose={() => setShowNarratorPicker(false)}
        />
      )}

      {/* Vytvoření / úprava vypravěče (nad výběrem) */}
      {narratorModal && (
        <NarratorModal
          key={narratorModal.mode === 'edit' ? narratorModal.id : 'new'}
          narrator={editingNarrator}
          image={editingNarrator ? assetUrl(gameName, editingNarrator.image, assetVersion) : null}
          onSubmit={handleNarratorSubmit}
          onDelete={editingNarrator ? () => deleteNarrator(editingNarrator.id) : undefined}
          onClose={() => setNarratorModal(null)}
        />
      )}

      {/* Vytvoření / úprava postavy */}
      {characterModal && (
        <CharacterModal
          key={characterModal.mode === 'edit' ? characterModal.id : 'new'}
          character={editingCharacter}
          image={editingCharacter ? assetUrl(gameName, editingCharacter.image, assetVersion) : null}
          onSubmit={handleCharacterSubmit}
          onDelete={editingCharacter ? () => deleteCharacter(editingCharacter.id) : undefined}
          onClose={() => setCharacterModal(null)}
        />
      )}
      {/* Vytvoření / úprava dějové nitě */}
      {threadModal && (
        <ThreadModal
          key={threadModal.mode === 'edit' ? threadModal.id : 'new'}
          thread={editingThread}
          allCharacters={characterOptions}
          allFactions={factionOptions}
          sceneTitles={scenes.map(s => s.title)}
          defaultScene={currentScene?.title ?? null}
          onSubmit={handleThreadSubmit}
          onDelete={editingThread ? () => deleteThread(editingThread.id) : undefined}
          onClose={() => setThreadModal(null)}
        />
      )}
      {/* Vytvoření / úprava frakce */}
      {factionModal && (
        <FactionModal
          key={factionModal.mode === 'edit' ? factionModal.id : 'new'}
          faction={editingFaction}
          emblem={editingFaction ? assetUrl(gameName, editingFaction.emblem, assetVersion) : null}
          allCharacters={characterOptions}
          otherFactions={factions.filter(f => f.id !== editingFaction?.id)}
          subfactions={factionSubfactions}
          incomingRelations={factionIncomingRelations}
          relatedThreads={factionThreads}
          onSubmit={handleFactionSubmit}
          onDelete={editingFaction ? () => deleteFaction(editingFaction.id) : undefined}
          onOpenFaction={openFaction}
          onOpenThread={openThread}
          onClose={() => setFactionModal(null)}
        />
      )}
      {/* Vytvoření / úprava scény; bez scén je dialog povinný */}
      {sceneModal && (
        <SceneModal
          key={sceneModal.mode === 'edit' ? sceneModal.id : 'new'}
          scene={editingScene}
          image={editingScene ? assetUrl(gameName, editingScene.image, assetVersion) : null}
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
