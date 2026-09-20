import type { Character, Narrator, SceneImportAmbiguity, SceneImportResponse } from '@solo-rpg/shared'
import { ValidationError, NotFoundError } from './StorageProvider.js'
import type { StorageProvider } from './StorageProvider.js'
import { normalize, parseSpeakerLines, previousNarratorNames } from '../ai/scenePrompt.js'

/** Zástupný vypravěč pro hry bez vypravěče – záznamy se uloží jako vypravěč bez souboru (`**Vypravěč**:`) */
const FALLBACK_NARRATOR: Narrator = { id: 'narrator', name: 'Vypravěč', description: '', aiPrompt: '', image: null }

/**
 * Párování jména z přepisu na postavu hry: celé jméno → jednoznačné; jinak hráčovo rozhodnutí z `resolutions`; jinak
 * postavy se stejnou přezdívkou nebo křestním jménem – jedna = shoda, více = nejednoznačné (např. dvě Kláry).
 */
function buildCharacterMatcher(characters: Character[], resolutions: Record<string, string>, ambiguous: Map<string, SceneImportAmbiguity>) {
  const resolved = new Map(Object.entries(resolutions).map(([name, full]) => [normalize(name), full]))
  return (name: string): Character | 'ambiguous' | null => {
    const key = normalize(name)
    const exact = characters.find(c => normalize(c.name) === key)
    if (exact) return exact
    const chosen = resolved.get(key)
    if (chosen) {
      const character = characters.find(c => c.name === chosen)
      if (character) return character
    }
    const candidates = characters.filter(c => normalize(c.nickname) === key || normalize(c.firstName) === key)
    if (candidates.length === 1) return candidates[0]
    if (candidates.length > 1) {
      // Varianty zápisu (Klára / klára) hlásit jednou; `resolutions` se párují bez ohledu na velikost písmen
      if (!ambiguous.has(key)) ambiguous.set(key, { name: name.trim(), candidates: candidates.map(c => c.name) })
      return 'ambiguous'
    }
    return null
  }
}

/**
 * Import odehraného přepisu (např. z Notionu) do scény: text ve tvaru `**Jméno**: replika` / `**Jméno:** replika`
 * (tučné písmo nepovinné) se rozdělí na záznamy podle mluvčích a připíše na konec scény.
 * - Jména se párují na postavy hry (celé jméno, přezdívka i křestní jméno, bez ohledu na velikost písmen) a vypravěče.
 * - Když jméno odpovídá více postavám (dvě Kláry), nic se neuloží a vrátí se `ambiguous` – FE nechá hráče vybrat
 *   a zavolá import znovu s `resolutions` (jméno v textu → celé jméno postavy).
 * - Řádky bez mluvčího navazují na předchozí záznam → víceřádkový markdown.
 * - Tučné neznámé jméno se uloží jako dočasná postava s tím jménem (FE ji nabídne k vytvoření).
 * Vrací jen nově přidané záznamy.
 */
export async function importSceneTranscript(storage: StorageProvider, gameName: string, sceneId: string, text: string, resolutions: Record<string, string> = {}): Promise<SceneImportResponse> {
  if (!text.trim()) throw new ValidationError('Vlož text přepisu, který se má do scény přidat.')

  const detail = await storage.getGame(gameName)
  if (!detail) throw new NotFoundError(`Hra „${gameName}“ neexistuje.`)
  const scene = detail.scenes.find(s => s.id === sceneId)
  if (!scene) throw new NotFoundError(`Scéna „${sceneId}“ neexistuje.`)

  const narrator = detail.setup.narrators.find(n => n.name === detail.setup.narrator) ?? FALLBACK_NARRATOR
  const existing = (await storage.getSceneEntries(gameName, sceneId)) ?? []

  // Párovat na všechny postavy hry (přepis může zmiňovat i postavy, které ve scéně zatím nejsou)
  const ambiguousNames = new Map<string, SceneImportAmbiguity>()
  const parsed = parseSpeakerLines(text, detail.setup.characters, narrator, previousNarratorNames(existing, narrator), {
    otherNarrators: detail.setup.narrators,
    unknownSpeaker: 'bold-character',
    matchCharacter: buildCharacterMatcher(detail.setup.characters, resolutions, ambiguousNames),
  })
  if (ambiguousNames.size > 0) {
    return { entries: [], addedCharacters: [], ambiguous: [...ambiguousNames.values()] }
  }
  if (parsed.length === 0) throw new ValidationError('V textu se nepodařilo najít žádné záznamy.')

  // Hra bez vypravěče → záznamy vypravěče bez jména (starý zápis), ne odkaz na neexistující soubor
  const entries = narrator === FALLBACK_NARRATOR
    ? parsed.map(e => (e.characterName === null && e.narratorName === FALLBACK_NARRATOR.name ? { ...e, narratorName: null } : e))
    : parsed

  // Postavy, které v přepisu mluví a ve scéně chybí, do ní přidat (ať jsou vidět v pásu postav)
  const known = new Set(detail.setup.characters.map(c => c.name))
  const missing = [...new Set(entries.map(e => e.characterName).filter((n): n is string => n !== null && known.has(n) && !scene.characters.includes(n)))]
  if (missing.length) {
    await storage.updateScene(gameName, sceneId, { title: scene.title, characters: [...scene.characters, ...missing] })
  }

  const current = (await storage.getSceneEntries(gameName, sceneId)) ?? existing
  await storage.saveSceneEntries(gameName, sceneId, [...current, ...entries])
  return { entries, addedCharacters: missing, ambiguous: [] }
}
