# Kontext pro Copilota (Claude Fable 5.1) – projekt Solo RPG

Tento text je předávací zpráva „od tebe pro tebe“. Napsal ji Claude Fable 5.1 v předchozí session
(otevřené nad `solo-rpg-fe`), aby nová session nad monorepem `c:\development\solo-rpg` věděla, co se udělalo,
proč, a co je v plánu dál. Přečti si ho celý, než začneš cokoli měnit. Uživatel je Lukáš (@lukas2035),
komunikuje **česky**, je fullstack (React i Java/Spring Boot na stejné úrovni).

---

## 1. Vize projektu (co Lukáš chce)

- Aplikace **Solo RPG** = správce sólového hraní RPG. Dnes: editor příběhu (scény, repliky postav a vypravěče/narratora,
  portréty, pozadí). Do budoucna: NPC, questy, lokace atd. **Terminologie:** používat „narrator / vypravěč“, nikdy „DM“
  (aplikace není vázaná na D&D – funguje s VtM, Fate…).
- **Teď:** vše běží **lokálně na localhostu** a ukládá se do složky, kterou umí otevřít **Obsidian** jako vault
  (Markdown + YAML frontmatter + obrázky). Lukáš chce soubory ručně editovat v Obsidianu a appka to musí přežít
  (zachovat jeho poznámky/frontmatter klíče, načíst ručně dopsané repliky).
- **AI vypravěč přes OpenRouter – první verze HOTOVÁ** (viz §3 „AI vypravěč“). Další plán: SSE streaming odpovědi,
  přepínání modelů (`ModelRouter`, běžný model vs. Mistral Large pro explicitní 18+ scény; flag mature na úrovni hry/uživatele,
  defaultně vypnuto, uživatelský přepínač režimu scény, ne regex klasifikace), strukturované návrhy změn nití/questů.
- **Ještě později (možná):** cloud, více uživatelů, monetizace. Proto: doménový model nezávislý na úložišti,
  `StorageProvider` interface → dnes `ObsidianVaultProvider`, později Postgres/S3.

## 2. Architektonická rozhodnutí (už odsouhlasená, neotevírat znovu)

- **Nepřecházet na Next.js.** FE zůstává Vite + React 19 SPA. Důvod: zápis na disk vyžaduje dlouhoběžící
  Node server, žádné SEO, cloud později = klasický BE.
- **BE = Node + TypeScript (Fastify 5, tsx), ne Spring Boot.** Zvažováno, Lukáš souhlasil s Node kvůli sdíleným
  typům s FE (`packages/shared` + Zod), snadnému SSE streamingu z LLM, Markdown ekosystému a levnějšímu hostingu.
- Monorepo přes **npm workspaces**, root `c:\development\solo-rpg`. Git repozitář, remote
  `origin` = https://github.com/lukas2035/solo-rpg (větev `main`); push funguje přes Git Credential Manager.
- Windows prostředí, PowerShell 5 – používat `npm.cmd`, ne `&&`.

## 3. Aktuální stav – co je HOTOVÉ a otestované

```
solo-rpg/
├── package.json            npm workspaces; scripts: dev (concurrently BE+FE), dev:be, dev:fe, build, lint
├── .gitignore, README.md
├── packages/shared/        @solo-rpg/shared – TS typy + zod schémata (src/index.ts):
│                           ImageRef, Character, Narrator, GameSetup, GameMeta, GameDetail, SceneMeta, StoryEntry,
│                           StoryThread (+ ThreadType/Status/Horizon/Certainty/Clock, ThreadInput, OPEN_THREAD_STATUSES),
│                           Faction (+ FactionType/Status/Stance, FactionRelation, FactionInput),
│                           AssetKind/AssetResponse, isValidGameName, INVALID_GAME_NAME_CHARS, isRemoteImage
├── solo-rpg-be/            Fastify 5 + TS; .env: VAULT_PATH=../vault (výchozí, FE ho může přepnout), PORT=3001
│   └── src/
│       ├── server.ts, config.ts
│       ├── routes/games.ts, routes/vault.ts (GET/PUT /api/vault, nativní dialogy, /vault/* statické soubory z aktuálního vaultu)
│       ├── system/dialogs.ts (Windows dialogy výběr složky / Uložit jako přes powershell.exe -STA + WinForms; jinde 501)
│       └── vault/StorageProvider.ts (interface + NotFound/Conflict/ValidationError)
│                 VaultManager.ts (aktuální složka s hrami → provider + watcher; `use(path)` přepne, hook čte `x-vault-path` / `?vault=`)
│                 backup.ts (zip celé složky hry přes `archiver`, zápis do .tmp + rename)
│                 ObsidianVaultProvider.ts (fs + gray-matter; CRUD postav, migrace npcs/ → characters/)
│                 sceneMarkdown.ts (parseEntries / serializeEntries / renameSpeaker)
│                 sessionsMarkdown.ts (parseSessions / serializeSessions – herní sezení v `sessions.md`)
│                 GameWatcher.ts (fs.watch recursive na složku otevřené hry → SSE `change` události)
│                 fsUtils.ts (assertInside, writeFileAtomic, safeFileName…)
├── solo-rpg-fe/            Vite + React 19 + react-router + Tailwind, lint = oxlint
│   └── src/
│       ├── pages/Home.tsx (seznam her přes API, „Zálohovat hru“, zápatí s aktuální složkou her + „Změnit složku“)
│       ├── pages/StoryEditor.tsx (přepnuto na API, scény, autosave nastavení s debounce)
│       ├── components/ VaultGate (při startu: bez uložené cesty zobrazí VaultSetup, jinak PUT /api/vault a teprve pak app),
│       │               VaultSetup (pole cesty + 📂 nativní výběr + „Vytvořit složku a použít“ když neexistuje),
│       │               CharacterBar, CharacterModal, SceneBar, SceneModal, ImageDropField (sdílené pole obrázku),
│       │               NarratorPickerModal (výběr aktuálního vypravěče), NarratorModal (formulář vypravěče),
│       │               SidePanel (aside se záložkami Nitě | Frakce), ThreadsPanel + ThreadModal (dějové nitě),
│       │               FactionsPanel + FactionModal (frakce), ChipGroup (chipy pro výčty), EntityChecklist (checklist entit),
│       │               InputArea, PortraitModal, FloatingPortrait (plovoucí okno portrétu), StoryPanel, SessionModal (stopky + hodnocení + historie sezení)
│       ├── hooks/ useSessionTimer.ts (stav stopek v localStorage per hra)
│       └── utils/ api.ts (API klient, ApiError; každý request nese `x-vault-path`), vaultPath.ts (cesta k hrám v localStorage `solo-rpg:vault-path` + useVaultPath),
│                  forms.ts (selectAll, inputClass), threads.ts / factions.ts (české popisky/barvy výčtů),
│                  exportGame.ts (buildGameMarkdown – celá hra do jednoho textového .md bez obrázků; toPlainMarkdown ruší obrázky
│                  a wikilinky; downloadTextFile přes Blob; volá se z CharacterBar 📄 → StoryEditor.handleExportGame, který
│                  si čerstvě stáhne getGame + getSceneEntries všech scén)
│                  (bývalý import z IndexedDB – legacyBrowserStorage/importLegacyGames – byl odstraněn, data jsou jen ve vaultu)
└── vault/                  výchozí VAULT_PATH (gitignored jako `/vault/` – POZOR, ne `vault/`, to by ignorovalo i src/vault) – otevřít v Obsidianu „Open folder as vault“
```

### Layout vaultu (na hru)
```
vault/<Název hry>/
  game.md                 frontmatter: name, createdAt, updatedAt, background, brightBackground, narrator (wikilink `[[Jméno]]` aktuálního vypravěče | null),
                          rulesInAi (bool); tělo = volné poznámky hráče + volitelně `<!-- rules -->` + popis pravidel pod příběhem
                          (`GameSettings.rules`; `splitGameBody`/`joinGameBody`, saveSetup poznámky zachová). UI: `RulesModal` přes 🎲 v CharacterBar,
                          StoryEditor.handleRulesSave ukládá hned (ne debounce) a synchronizuje `lastSavedSetupRef`.
  characters/<Celé jméno>.md  frontmatter: id, name (celé), firstName, lastName, nickname, portrait, order;
                          tělo = markdown poznámky (editovatelné v modalu i v Obsidianu). PC i NPC bez rozlišení.
                          (stará složka npcs/ se při prvním čtení automaticky přejmenuje, `name` se rozdělí na jméno/příjmení)
  narrators/<Jméno>.md    frontmatter: id, name, portrait, order; tělo = markdown popis (description), za značkou `<!-- ai-prompt -->`
                          doplňkový AI prompt vypravěče (aiPrompt; značka chybí, když je prázdný). Vypravěč = narrator,
                          napojený na AI (OpenRouter). Nová hra nemá žádného; starý `dm{name,portrait}` v game.md
                          se při getGame automaticky migruje (soubor + přesun `_dm.*` → portraits/narrators/, výchozí „DM“ bez portrétu se zahodí).
  portraits/<Celé jméno>.png   portréty postav; portraits/narrators/<Jméno>.ext vypravěči (`narrator`); portraits/factions/<Název>.ext emblémy (`faction`)
  threads/<Název>.md      frontmatter: id (thread-<ts>, stabilní i při přejmenování), title, type, status, horizon, certainty,
                          revealCondition (string|null), clock ({current,max}|null), characters (wikilinky), scene (wikilink|null),
                          factions (wikilinky), createdAt, updatedAt; tělo = markdown popis (description). Výčty = malé anglické klíče, UI česky.
  factions/<Název>.md     frontmatter: id (faction-<ts>), title, type, status, stance, leader (wikilink|null), parentFaction (wikilink|null),
                          goals (string[]), characters (wikilinky), relations ([{faction: wikilink, stance, note}]), emblem, createdAt, updatedAt;
                          tělo = veřejný popis, za značkou `<!-- secrets -->` tajemství (značka chybí, když jsou prázdná).
  quests/<Název>.md       frontmatter: id (quest-<ts>), title, type, status, questGiver (wikilink|null), parentQuest (wikilink|null),
                          objectives ([{id, title, status, optional?}] – `optional` jen když true), rewards (string[]),
                          characters/threads/factions (wikilinky), createdAt, updatedAt;
                          tělo = popis, pak `<!-- outcome -->` výsledek, pak `<!-- notes -->` poznámky (značky chybí, když prázdné).
  backgrounds/<soubor>    obrázky scén jako backgrounds/<Název scény>.ext (+ případné staré pozadí hry `background` v game.md;
                          v UI se už nenastavuje ani nemaže, slouží jen jako fallback pro scény bez obrázku)
  scenes/001 - Název.md   frontmatter: id, title, order, image, characters (wikilinky `[[Celé jméno]]` postav ve scéně), location,
                          ai (bool – AI vypravěč zapnutý), aiCharacters (wikilinky postav hraných AI), aiPrompt (volitelný doplňující popis
                          situace jen pro AI; null když prázdný, nedědí se do nové scény), createdAt, updatedAt
                          tělo: markdown popis scény, pak značka `<!-- entries -->`, pak záznamy
                          záznamy: <!-- entry id="..." ts="..." --> + **[[Celé jméno|nickname]]**: text  |  **[[Jméno vypravěče]]**:\n víceřádkový text
                          (soubor bez značky = starý formát, celé tělo jsou záznamy; `**DM**:`/`**Vypravěč**:` = vypravěč bez souboru)
```
Parser scén dělí i ručně dopsané záznamy bez markeru podle řádků `**Jméno**:` – wikilink `[[..]]` vždy,
plain jméno jen pokud je to známý mluvčí (celé jméno, nickname, jméno vypravěče), aby `**Důležité**:` v odstavci vypravěče nebyl nový mluvčí.
Víceřádkový text → `markdown: true`. `StoryEntry.characterName` = celé jméno; alias v odkazu je nickname.
`StoryEntry.narratorName` = jméno vypravěče u záznamů vypravěče (null = starý zápis bez souboru). Wikilink, který je zároveň
postavou i vypravěčem, se bere jako postava.
Přejmenování postavy / změna nicku na BE přepíše hlavičky mluvčího ve všech scénách a přejmenuje portrét; stejně přejmenování
vypravěče (+ aktualizuje `narrator` v game.md). Smazání aktuálního vypravěče vynuluje `narrator` v game.md.
Nová hra **nemá** automatickou „Scéna 1“ – FE při hře bez scén otevře povinný `SceneModal`.

### Postavy (FE)
- „+“ v pásu i klik na postavu otevře `CharacterModal`: Jméno, Příjmení, Nickname (sleduje křestní jméno, dokud ho
  uživatel nepřepíše), portrét (klik/drop/URL), markdown poznámky. Fokus/Tab označí celý text. Enter odešle, Esc zavře.
- Submit: `POST/PUT /characters` (409 při duplicitním celém jménu → hláška v dialogu) → `storeImage(kind portrait, celé jméno)`
  → `PUT` s cestou portrétu. Postavy se **neukládají přes setup autosave** (ten jen pozadí + jméno aktuálního vypravěče).
- Mluvčí dopsaný v Obsidianu bez souboru postavy = dočasná postava (`id: tmp-…`); klik na ni otevře dialog a vytvoří soubor.
- V UI (pás, taby, repliky) se zobrazuje nickname.

### Vypravěči (FE)
- 🎭 v pásu otevře `NarratorPickerModal`: seznam vypravěčů hry (portrét, jméno, první řádek popisu), klik = vybrat
  aktuálního (uloží se přes setup autosave `narrator`), ✏️ = upravit, „+ Nový vypravěč“ → `NarratorModal` (jméno, markdown
  popis, portrét). Submit: `POST/PUT /narrators` (409 duplicitní jméno) → `storeImage(kind narrator, jméno)` → `PUT` s cestou.
- Dokud hra nemá vypravěče: v `InputArea` je místo tabu vypravěče tlačítko **„Zadat vypravěče“** (otevře `NarratorModal`),
  výběr vypravěče (klik, Ctrl/Alt+0, Tab) není možný, výchozí výběr padne na první postavu; první vytvořený vypravěč se
  rovnou stane aktuálním. Záznam vypravěče nese `narrator` (portrét + jméno v `StoryPanel`); bez souboru → placeholder „Vypravěč“.
- `public/dm.png` byl odstraněn – žádný výchozí portrét vypravěče.

### Scény (FE)
- `SceneBar`: select scén, „+“ (nová) a ✏️ (úprava aktuální) → `SceneModal`: název, markdown popis, obrázek scény.
- Obrázek scény se ukládá jako `backgrounds/<Název scény>.ext` (AssetKind `scene`, `ownerName` = název) a při aktivní
  scéně má přednost před pozadím hry. Přejmenování scény přejmenuje soubor i obrázek; smazání scény smaže i obrázek.
- Submit: `POST /scenes` nebo `PATCH /scenes/:id` (409 při duplicitním názvu) → `storeImage` → `PATCH` s cestou.
  `image: undefined` = beze změny, `null` = odebrat (stejný vzor jako u postav).
- Hra bez scén → dialog s `required` (bez Zrušit, Esc nezavře). Smazat lze i poslední scénu → znovu povinný dialog.
- **Postavy scény**: každá scéna má `characters` (celá jména). V pásu a v InputArea jsou jen postavy aktuální scény
  (+ dočasní `tmp-` mluvčí, kteří v ní mluví). Checklist v `SceneModal` vybírá z postav hry; nová scéna předvyplní
  postavy poslední scény (BE to dělá i bez `characters` v POST), první scéna všechny postavy hry. „+“ v pásu (malé
  tlačítko) vytvoří postavu a přidá ji do aktuální scény (`PATCH /scenes/:id {title, characters}`). Tlačítko
  „Nová postava“ v `SceneModal` otevře vnořený `CharacterModal` (`onCreateCharacter`) a novou postavu zaškrtne.
  BE při rename/delete postavy
  přepíše seznamy ve scénách; soubor scény bez klíče `characters` = všechny postavy hry (zpětná kompatibilita).
- Sdílené: `ImageDropField` (klik/drop/URL), `utils/forms.ts` (`selectAll`, `inputClass`).

### Dějové nitě / Threads (FE + BE)
- Zadání přišlo od ChatGPT; **odchylky odsouhlasené s Lukášem**: vazby jsou wikilinky podle názvu (ne `char_marek` ID),
  žádná generická `links:{locations,quests,factions}` struktura ani `entityType` (YAGNI – přidá se až s entitami),
  složka malým `threads/`, jediné markdown tělo místo `## Description`/`## Notes` sekcí, výčty jako stabilní lowercase
  klíče s českými popisky (`utils/threads.ts`), navíc volitelná vazba `scene` (kde nit vznikla, default = aktuální scéna).
- Typy: complication/threat/mystery/opportunity/obligation/relationship (povinné, bez defaultu). Stavy: latent/active/
  escalated (= otevřené, `OPEN_THREAD_STATUSES`) + resolved/expired. Horizont immediate/short-term/long-term.
  Jistota confirmed/unresolved (+ `revealCondition` – jen text, nic automatického). Hodiny volitelné, ručně (max 1–24).
- BE `ObsidianVaultProvider`: `listThreads/createThread/updateThread/deleteThread`, 409 na duplicitní název (case-insensitive),
  přejmenování = rename souboru se stejným id; `normalizeSceneCharacters` filtruje neznámé postavy, `normalizeThreadScene`
  neznámou scénu → null. Hooky `renameCharacterInThreads` (updateCharacter/deleteCharacter) a `renameSceneInThreads`
  (updateScene/deleteScene). `GameDetail.threads` se vrací v `getGame`; `createGame` zakládá `threads/`.
- FE: 🧵 v pásu (odznak = počet otevřených) přepíná `ThreadsPanel` (aside vpravo od příběhu): hledání, filtry typ/stav/
  horizont/jistota, výchozí jen otevřené, „Vyřešené a vyhaslé (n)“ sbalené; v řádku select stavu a ± hodin
  (`patchThread` posílá celou nit). Klik na název / „+ Nová“ → `ThreadModal` (chipy pro výčty, hodiny s klikatelnými
  tečkami, checklist postav, select scény, markdown popis, Smazat s confirm, 409 hláška). `StoryEditor` drží `threads`
  stav, propisuje rename/delete postav a scén i lokálně.

### Frakce / Factions (FE + BE)
- Zadání opět od ChatGPT (počítalo s neexistujícími Quests, `EntityLinks`, ID vazbami a backlink systémem); **odchylky
  odsouhlasené s Lukášem**: wikilinky podle názvu, žádné Quests/Locations (`headquartersLocationId` se přidá až s lokacemi),
  9 typů místo 12 (political/military/religious/criminal/commercial/clan/secret/supernatural/other), **jeden výčet
  `FactionStance`** pro postoj k družině i pro vztahy mezi frakcemi (allied/friendly/neutral/tense/hostile/unknown),
  vztah bez vlastního `id` (klíč = cílová frakce), `goals` jen ve frontmatteru (žádná duplicitní `## Goals` sekce),
  žádné `links.factions` vedle `relations`, tajemství za značkou `<!-- secrets -->` (analogie `<!-- entries -->`),
  směr vazby nit → frakce (`StoryThread.factions`), nitě frakce se dopočítávají. Emblém = `ImageRef` (AssetKind `faction`).
- **Jeden vztah = jeden záznam:** `relations` jsou uložené jen u zdrojové frakce; FE druhé straně zobrazí „příchozí“
  vztahy jen pro čtení s odkazem na zdroj (`factionIncomingRelations` v `StoryEditor`). Podfrakce = computed z `parentFaction`.
- BE `ObsidianVaultProvider`: `listFactions/createFaction/updateFaction/deleteFaction`; `resolveParentFaction` → 400 na
  sebe/cyklus; `normalizeFactionRelations` (jen existující cizí frakce, dedup, kanonický pravopis); neznámé hodnoty výčtů
  ze souboru → other/active/unknown. Hooky: `renameCharacterInFactions` (leader + characters), `renameFactionInFactions`
  (parentFaction + relations), `renameFactionInThreads`; delete frakce vyčistí parent/relations/thread.factions.
  `FactionInput.emblem`: undefined = ponechat, null = odebrat.
- FE: 🏴 v pásu (odznak = počet aktivních) otevírá `SidePanel` na záložce Frakce; `FactionsPanel` – hledání, filtry
  typ/stav/postoj, v řádku rychlý select postoje, neaktivní sbalené. `FactionModal` – chipy typ/stav/postoj, emblém,
  select vůdce a nadřazené frakce, cíle CRUD + pořadí, checklist postav, editor vztahů + příchozí vztahy, dopočítané
  podfrakce a nitě (klik otevře příslušný modal), popis, sbalitelná tajemství. Vytvoření s emblémem = create → asset → update.

### Questy / Quests (FE + BE)
- Zadání od ChatGPT (počítalo s `links.{characters,locations,quests,threads,factions}` podle ID, `entityType`, `## Description`
  sekcemi, PascalCase výčty); **odchylky odsouhlasené s Lukášem**: wikilinky podle názvu jako u nití/frakcí, složka `quests/`,
  žádné `links`/`entityType`/Locations, lowercase výčty + české popisky (`utils/quests.ts`), popis volitelný, `optional`
  se zapisuje jen pokud true, Výsledek/Poznámky za značkami `<!-- outcome -->`/`<!-- notes -->`. Frakce už existují →
  vazba quest → frakce je funkční. Progress se nikam neukládá (`questProgress()` ve shared počítá jen povinné cíle).
- Typy: main/side/personal/investigation/faction/exploration/survival (povinné). Stavy: available/active/paused
  (= otevřené, `OPEN_QUEST_STATUSES`) + completed/failed/abandoned; `QUEST_STATUS_ORDER` = výchozí řazení.
  Cíle: pending/active/completed/failed/skipped. Změna stavu questu nic nedělá s nitěmi ani cíli (ručně, záměrně).
- Směr vazeb: quest → characters/threads/factions, questGiver, parentQuest. Backlinky (podřízené questy, „Součást questů“
  v `ThreadModal`) se dopočítávají ve FE (`questChildren`, `threadQuests` ve `StoryEditor`).
- BE `ObsidianVaultProvider`: `listQuests/createQuest/updateQuest/deleteQuest`; `normalizeObjectives(input, previous)`
  zachová id existujících cílů (nové `objective-<ts>-<n>`), `parseObjectives` snese ruční soubor (string = title, chybějící id
  → `objective-<index>`); `resolveParentQuest` → 400 na sebe/cyklus; `normalizeCharacterRef` (dřív `normalizeFactionLeader`)
  pro questGiver i leader; neznámé výčty → side/available/pending. Hooky: `renameCharacterInQuests`, `renameThreadInQuests`,
  `renameFactionInQuests`, `renameQuestInQuests` (parentQuest); delete questu → child questy parentQuest=null.
- FE: 📜 v pásu (odznak = počet aktivních) → `SidePanel` záložka Questy; `QuestsPanel` – hledání, filtry typ/stav/postava,
  řazení dle stavu pak updatedAt, řádek = typ·stav·progress bar, další cíl, zadavatel, rychlý select stavu; ukončené sbalené.
  `QuestModal` – chipy typ/stav, popis, editor cílů (klik na značku cykluje pending→active→completed, select stavu, „volit.“,
  ↑↓✕, Enter přidá), zadavatel, nadřazený quest (+ ↗), odměny CRUD + pořadí, checklisty postav/nití/frakcí, dopočítané
  navazující questy, Výsledek, sbalitelné Poznámky, Smazat s confirm.

### Herní sezení / stopky (FE + BE)
- **Účel (Lukáš):** měřit reálný čas každého sezení, ohodnotit zábavnost 0–10 po 0,5 a připsat popis – pro pozdější analýzu,
  co na sólo hraní baví; přehled celkového času ve hře. Sezení **není vázané na scénu**.
- **Shared:** `GameSession {id, startedAt, endedAt, durationSeconds, fun, description}`, `GameSessionInput`, `FunRatingSchema`
  (0–10, `v*2` celé číslo). `id` = `String(startedAt)`.
- **BE:** `vault/sessionsMarkdown.ts` – jeden soubor `<Hra>/sessions.md`: `# Herní sezení`, řádek „Celkem: N sezení · čas · průměr“
  (jen pro čtení, přepisuje se), pak bloky `## <datum> · <délka> · <fun>/10` + odrážky `Začátek` (ISO, zdroj id), `Konec`,
  `Délka (s)`, `Zábavnost` (tečka), prázdný řádek, popis (volný markdown až k dalšímu `## `). Parser bere odrážky jen do prvního
  ne-odrážkového řádku, takže odrážky v popisu nevadí. `ObsidianVaultProvider.list/create/update/deleteSession` (create posune
  `startedAt` o 1 ms při kolizi, `touchGame`), routy `GET/POST/PUT/DELETE /api/games/:game/sessions[/:session]`.
- **FE:** `hooks/useSessionTimer(game)` – stav `{startedAt, accumulatedMs, runningSince, fun, description}` v localStorage
  `solo-rpg:session-timer:<hra>` (přežije zavření dialogu i reload; běžící úsek se dopočítá z `runningSince`), tik 1 s jen za běhu,
  `start/pause/reset/clear/setFun/setDescription`; stav vázaný na hru bez efektu (derivace v renderu kvůli oxlint react rules).
  `SessionModal` – velké hodiny, ▶/⏸/↺, `FunRating` (10 hvězd s klikatelnými půlkami + range 0–10 step 0,5), textarea popisu,
  „💾 Uložit sezení“ (POST, pak `timer.clear()`), historie (řazená od nejnovější, celkem/průměr, inline ✏️ úprava fun+popisu, ✕ smazání).
  `CharacterBar` tlačítko ⏱️ (`onOpenSession`, `sessionRunning` = zelené + pulzující tečka, `sessionPaused` = oranžové).

### AI vypravěč / OpenRouter (FE + BE) – první verze
- **Rozhodnutí Lukáše:** samostatné tlačítko 🤖 + dialog scény (ne v NarratorPickeru); AI řádky za hráčovy postavy i neznámá
  jména se **ukládají** (neznámé jméno → záznam vypravěče s prefixem `Jméno: `), uživatel si je smaže; AI odpoví po **každém**
  záznamu hráče v AI módu (i za vypravěče). Bez streamování (zatím jen indikátor „🤖 <vypravěč> píše…“).
- **Konfigurace** (`solo-rpg-be/.env`, `config.ts` → `config.ai`): `OPENROUTER_API_KEY` (bez něj endpoint vrací 503),
  `OPENROUTER_MODEL` (default `mistralai/mistral-large-2512`), `AI_PROMPT_PATH` (default `prompts/scene-prompt.md`),
  `AI_MAX_TOKENS` (1500), `AI_TEMPERATURE` (0.9). **`solo-rpg-be/prompts/scene-prompt.md`** = výchozí prompt pro vedení scény
  (Lukáš tam vloží svůj text z ChatGPT; je verzovaný v gitu).
- **Datový model:** `Narrator.aiPrompt` (tělo souboru za `<!-- ai-prompt -->`, `NarratorInput.aiPrompt?`), `SceneMeta.ai` +
  `SceneMeta.aiCharacters` (frontmatter `ai`, `aiCharacters` wikilinky; `SceneInput.ai?/aiCharacters?`, undefined = beze změny).
  BE: `aiCharacters` jen z postav scény (filtr i při změně `characters`), nová scéna dědí `ai`+`aiCharacters` z poslední,
  rename/delete postavy propisuje i `aiCharacters` (`renameSpeakerInScenes`, `removeCharacterFromScenes`). Helper `splitByMarker`.
- **BE modul `src/ai/`:** `openRouter.ts` (`chatCompletion`, `AiError{status}` – sendError ji mapuje na HTTP stav),
  `scenePrompt.ts` (`buildMessages` – system = soubor promptu, user = Vypravěč → Postavy hráče → Postavy AI (s `notes`) →
  Scéna (title, location, description) → volitelně „Doplňující popis situace“ (`scene.aiPrompt`) → Dosavadní průběh (`formatTranscript`, stejný formát jako 📋 export: `**Nick**: text`,
  víceřádkové `**Jméno**:\ntext`) → Pokyny vypravěče (`aiPrompt`) → Úkol; `parseAiReply` – řádky `Jméno: text` i `**Jméno**:`,
  vypravěč = jeho jméno, Narrator/Vypravěč/GM/DM/Storyteller nebo jméno předchozího vypravěče scény (`previousNarratorNames`
  z `entries.narratorName`; sekce Vypravěč v promptu na přepnutí upozorní, parser tyto řádky uloží pod aktuálního vypravěče),
  postava podle celého jména či nicku, řádky bez mluvčího =
  pokračování (markdown), code fence se odstraní, „neznámé jméno“ jen ≤ 3 slova bez uvozovek, jinak pokračování),
  `sceneAi.ts` (`generateSceneReply`: getGame → aktuální vypravěč (400 bez něj) → postavy scény rozdělené podle `aiCharacters`
  → entries → prompt → OpenRouter → parse → **připojí k aktuálnímu stavu scény** (znovu načte, kdyby hráč mezitím psal) →
  vrací `{ entries: nové, raw }`). Route `POST /api/games/:game/scenes/:scene/ai` (+ `watcher.noteOwnChange` těsně před odpovědí).
- **FE:** `AiSceneModal` (zapnout/vypnout, karta vypravěče s „✏️ Prompt“/„🎭 Vybrat“, řádek na postavu s přepínačem 🧑 Já / 🤖 AI,
  „Nechat AI pokračovat“ = uložit + `runAi`), `NarratorModal` má textarea „🤖 AI prompt“, `CharacterBar` má 🤖 (cyan zvýraznění +
  tečka při zapnuté AI, pulz při generování) a odznak „🤖 AI“ + cyan rámeček u AI postav (`DisplayCharacter.ai`), `InputArea`
  taby AI postav s prefixem 🤖. `CharacterBar` karta postavy: klik na portrét = `PortraitModal` (celá obrazovka; bez portrétu = editace),
  při hoveru ikony ✏️ (editace), 🗗 (`onPortraitFloat` → `FloatingPortrait`: plovoucí okno v stránce, `fixed` z-40/41, přetažení za
  titulek, změna velikosti rohovými úchyty se zamčeným poměrem stran obrázku (`naturalWidth/naturalHeight`, výška se dopočítává
  z šířky), clamp do viewportu, více oken najednou – `StoryEditor.floatingPortraitIds`, poslední = nahoře; ⛶/dvojklik = `PortraitModal`)
  a ✕ (`onCharacterRemoveFromScene` → `removeCharacterFromCurrentScene`: PATCH scény bez postavy
  v `characters` i `aiCharacters`, postava ve hře i její záznamy zůstávají; jen pro `DisplayCharacter.inScene`, ne dočasné mluvčí),
  pravý klik = smazání z celé hry. `StoryEditor`: `persistStory` vrací Promise; `handleAddEntry` → po uložení `runAi(sceneId)`
  (guard přes `currentSceneIdRef` – odpověď se nepřipíše do jiné scény; `charactersRef` pro resolve); banner pod StoryPanelem
  „🤖 X píše…“ / chyba se „Zkusit znovu“; `handleAiSettingsSave` = `PATCH /scenes/:id {title, ai, aiCharacters}`; lokální rename/delete
  postavy aktualizuje i `aiCharacters` ve `scenes`.
- **Ověřeno:** build + lint (jen pre-existující warning), API smoke test (aiPrompt roundtrip/zachování/vymazání sekce, ai +
  aiCharacters PATCH s filtrem neznámé a mimo-scénové postavy, dědění do nové scény, rename/delete postavy, 503 bez klíče),
  unit test parseru a pořadí částí promptu. **Reálné volání OpenRouteru neproběhlo** (Lukáš teprve doplní klíč) – první věc
  k ověření v další session; případně doladit `SPEAKER_LINE`/prompt podle skutečných odpovědí Mistralu.

### Změny ve vaultu zvenčí (Obsidian)
- Tlačítka „znovu načíst“ (📂/💬) jsou pryč. FE se při otevření hry připojí na `GET /api/games/:name/events` (SSE,
  `api.subscribeVaultChanges`). BE `GameWatcher` sleduje složku hry přes `fs.watch({recursive})` – jen dokud je někdo
  připojený; na Windows jeden handle na strom, počet souborů nehraje roli. Ignoruje `*.tmp` a skryté složky (`.obsidian`).
- Vlastní zápisy BE se nehlásí: hooky `preHandler`/`onResponse` pro POST/PUT/PATCH/DELETE na `/api/games/:game/*`
  volají `watcher.noteOwnChange(game)` → 1,5 s tiché okno. Události se sdružují (debounce 400 ms).
- FE zobrazí oranžový banner „Došlo ke změně v souborech hry“ s tlačítkem „Načíst aktuální stav“ (`reloadFromVault`:
  getGame + záznamy aktuální scény) a ✕ pro skrytí.

### API (BE, port 3001; Vite proxy přesměrovává `/api` a `/vault` z 5173)
```
GET  /api/health
GET/POST /api/games            GET/PATCH(rename)/DELETE /api/games/:name
PUT  /api/games/:name/setup    (jen backgroundImage, brightBackground, narrator = jméno | null; 404 pro neznámého vypravěče)
POST /api/games/:name/characters             PUT/DELETE /api/games/:name/characters/:id
POST /api/games/:name/narrators              PUT/DELETE /api/games/:name/narrators/:id   ({ name, description?, aiPrompt?, image? })
GET/POST /api/games/:name/threads            PUT/DELETE /api/games/:name/threads/:id     (ThreadInput; title+type povinné)
GET/POST /api/games/:name/factions           PUT/DELETE /api/games/:name/factions/:id    (FactionInput; title+type povinné)
GET/POST /api/games/:name/quests             PUT/DELETE /api/games/:name/quests/:id      (QuestInput; title+type povinné)
POST /api/games/:name/assets (multipart: kind portrait|narrator|faction|background|scene, ownerName?, file)
POST /api/games/:name/assets/from-url ({ kind, url, ownerName? })
GET/POST /api/games/:name/scenes ({title, description?, image?, characters?, location?, ai?, aiCharacters?})
GET(záznamy)/PUT(záznamy)/PATCH(meta)/DELETE /api/games/:name/scenes/:id
POST /api/games/:name/scenes/:id/ai  (AI vypravěč odpoví a záznamy uloží; → { entries, raw }; 503 bez klíče, 400 bez vypravěče, 502 chyba OpenRouteru)
POST /api/games/:name/scenes/:id/summary (AI shrnutí děje scény – `ai/sceneSummary.ts`, prompt `prompts/scene-summary-prompt.md`, teplota max 0.3; nic neukládá → { summary, raw }; 400 bez záznamů)
  Oba AI endpointy (ai i summary) připojují k system promptu `ai/rulesPrompt.ts#buildRulesSection` – jen při
  `rulesInAi`, jinak vrací '' a neposílá se nic (příběhové scény bez kostek AI nemate). Se zapnutým přepínačem: obsah
  `prompts/rules-prompt.md` (`AI_RULES_PROMPT_PATH` – orákulum, hody zapsané v textu jsou fakta, AI nehází) +
  `## Herní pravidla pod příběhem` = `setup.rules` (nebo věta „žádný konkrétní systém“, když je prázdné).
  FE export (`utils/exportGame.ts`) má sekci „Kostky a pravidla“ vždy, s `rules` bez ohledu na `rulesInAi`.
GET  /api/games/:name/events  (SSE: event `change`, data `{paths: string[]}` – změny souborů hry mimo BE)
POST /api/games/:name/backup  ({ targetPath: absolutní .zip } → 201 { path, bytes }; 400 pro cíl uvnitř hry / špatnou příponu / chybějící složku)
GET/PUT /api/vault            (→ { path, defaultPath, nativeDialogs }; PUT { path, create? } přepne složku s hrami, 400 když neexistuje)
POST /api/system/pick-folder, /api/system/pick-save-file  (nativní dialogy; → { path | null }; 501 mimo Windows, 409 když už jeden běží)
GET  /vault/*  (statické soubory z aktuálně otevřené složky s hrami)
```

### Složka s hrami volitelná per prohlížeč (VaultManager)
- BE už nemá jeden pevný vault: `VaultManager` drží aktuální `{ path, storage, watcher }`; `use(path)` přepne (složka musí
  existovat, nebo `create`). Hook `onRequest` v `routes/vault.ts` čte hlavičku `x-vault-path` (URL-encoded, kvůli ne-ASCII
  znakům) nebo query `vault` a když se liší, přepne. FE (`utils/api.ts`) posílá hlavičku s každým requestem, `?vault=` u
  EventSource a `assetUrl`. `/vault/*` se servíruje ručně přes `reply.sendFile(rel, vault.path)` (`@fastify/static` se `serve:false`).
- FE: `VaultGate` v `App.tsx` – bez uložené cesty (localStorage `solo-rpg:vault-path`) zobrazí `VaultSetup`; s cestou zavolá
  `PUT /api/vault`, při 400 (složka zmizela) znovu nabídne výběr, při nedostupném BE pustí app dál (Home ukáže hlášku).
- Nativní dialogy (`system/dialogs.ts`): `powershell.exe -STA -EncodedCommand`, WinForms `OpenFileDialog` (trik s fiktivním
  názvem souboru → rodičovská složka; moderní vzhled s adresním řádkem) a `SaveFileDialog`; neviditelný TopMost owner form,
  aby dialog vyskočil před prohlížeč. Jen jeden dialog naráz (`DialogBusyError` → 409). Ověřeno: oba dialogy se otevřou se
  správným titulkem, zrušení vrací `{ path: null }`.
- Záloha (`vault/backup.ts`): `archiver` 8 (ESM, `new ZipArchive(...)`, default export není), složka hry jako kořenová položka
  zipu, zápis do `<cíl>.tmp` + rename. Ověřeno smoke testem vč. českého názvu hry.

### Shrnutí děje scény (`SceneMeta.summary`)
- Nové pole scény `summary` (markdown). V souboru scény leží mezi popisem a záznamy za značkou `<!-- summary -->`
  (`splitSceneBody`/`joinSceneBody` v `ObsidianVaultProvider.ts`; značka se nezapisuje, když je shrnutí prázdné).
  `SceneInput.summary` volitelný – PATCH bez něj shrnutí zachová, `""` ho smaže.
- FE: `SceneModal` má textarea „Shrnutí děje scény“ + tlačítko „🤖 Shrnout pomocí AI“ (jen u existující scény, prop
  `onSummarize`); výsledek se vloží do pole a uloží až „Uložit“ (`api.summarizeScene`). Při neprázdném poli se ptá na přepsání.
- Ověřeno reálným voláním OpenRouteru (Mistral Large): odstavec + Klíčové body + Otevřené otázky podle promptu.
- Nápad na příště: shrnutí předchozích scén přidat do promptu AI vypravěče (`scenePrompt.ts`) jako kontext kampaně.

### Ověřeno
- `npm.cmd run build` (shared, BE, FE) prochází; `npm.cmd run lint` – jen 1 pre-existující warning v `InputArea.tsx`.
- API smoke test (Node fetch skript – PowerShell mrší uvozovky v JSON, nepoužívat curl s inline JSON).
- Roundtrip s ručními úpravami „z Obsidianu“ (frontmatter i poznámky zůstaly, ruční repliky se načetly).
- Headless Edge render FE: hra, scény, postavy i portrét z `/vault/...` se zobrazí.
- Ve vaultu existují testovací hry („Testovací hra“, „Testovací hra 2“) – lze smazat.
- Postavy: API smoke test (create/409/portrét/alias ve scéně/rename vč. portrétu a wikilinků/migrace npcs/delete)
  + CDP test dialogu v headless Edge (předvyplnění nicku, Enter, 409 hláška, editace) – vše prošlo.
- Scény: API smoke test (create s popisem/409/obrázek scény/záznamy pod `<!-- entries -->`/rename souboru i obrázku/
  starý formát bez značky/odebrání obrázku/delete) + CDP test (povinný dialog u hry bez scén, Esc nezavře, vytvoření, ✏️ editace).
- Vypravěči: API smoke test (migrace legacy `dm` vč. přesunu `_dm.jpg`, parse `**DM**:` → narratorName null, create/409,
  setup výběr/404, zápis `**[[Jméno]]**:` do scény a zpětný parse, rename souboru + wikilinků + game.md, delete vynuluje
  aktuálního, nová hra bez vypravěče) – vše prošlo.
- Dějové nitě: API smoke test (create s defaulty/filtr neznámé postavy/wikilinky v souboru/409 case-insensitive/400 clock
  current>max/400 bez type/rename souboru se stejným id/propagace rename+delete postavy a scény/detail hry/delete/404) – prošlo.
  FE jen build + lint, headless klikací test neproběhl.
- Frakce: API smoke test (defaulty/kanonický pravopis parent/filtr neznámé postavy a vůdce/wikilinky + `<!-- secrets -->`
  v souboru/409/400 bez type/400 self-parent i cyklus/normalizace relations a thread.factions/rename souboru + propagace do
  relations, parentFaction, nití/rename+delete postavy → leader+characters/vymazání tajemství odstraní značku/delete vyčistí
  vazby/404/ruční soubor z Obsidianu) – prošlo. FE jen build + lint, klikací test neproběhl.
- Questy: API smoke test (~75 kontrol: defaulty/markdown s outcome+notes značkami/objectives id stabilní při update/
  409/400 bez type/400 prázdný cíl/400 self-parent i cyklus/rename souboru + propagace do parentQuest/rename+delete postavy,
  nitě, frakce/delete → child parent null/ruční soubor s cíli jako stringy/404) – prošlo. **CDP klikací test v headless Edge**
  (tab Questy, validace typu, cíle přes Enter, cyklování stavu, progress, řádek v panelu, rychlá změna stavu, editace,
  backlink v ThreadModal, bez chyb v konzoli) – prošlo.

## 4. Spuštění
```
cd c:\development\solo-rpg
npm.cmd run dev          # BE http://127.0.0.1:3001 + FE http://localhost:5173
```

## 5. Co je DALŠÍ na řadě (Lukáš ještě nevybral, zeptej se)
1. **AI vypravěč – další kroky:** ověřit s reálným klíčem OpenRouteru a doladit prompt/parser; SSE streaming odpovědi;
   `ModelRouter` (přepínání modelů, mature flag); AI context builder pro nitě/frakce/questy/lokace/lore (oddělit `description`
   od `secrets` – tajemství zná jen AI vypravěč); strukturované návrhy změn cílů/stavu questů a nití po scéně.
2. **Další typy poznámek ve vaultu:** lokace (`locations/*.md`) – vazby na nitě, frakce (sídlo `headquarters`, území) a questy
   (přidat pole + hooky rename/delete jako u postav/scén). Rozšíření postav (typ PC/NPC, vztahy, backlinky „frakce/questy postavy“).
   **Quests – další krok:** vazba scéna → quest (Related Scenes), AI návrhy změn cílů/stavu po scéně (strukturované akce).
3. **Threads – další krok:** návrhy nití z AI shrnutí scén, automatika hodin (zatím záměrně ručně), backlinky
   „nitě této postavy“ v `CharacterModal`. **Factions:** AI context builder musí oddělovat `description` (veřejné) a `secrets` (jen AI vypravěč).
4. Případně `chokidar` sledování vaultu – nyní řeší `GameWatcher` + SSE.
4. ~~Git init monorepa~~ – hotovo, repo je na GitHubu.

## 6. Pracovní konvence z minulé session
- Odpovídat česky, stručně; komentáře v kódu česky.
- Před většími kroky krátce vysvětlit přístup; plán držet v todos.
- Po změnách vždy `npm.cmd run build` + `lint` z rootu; API testovat Node skriptem.
- Neměnit nesouvisející kód; FE styl: Tailwind, funkční komponenty, typy z `@solo-rpg/shared`.
