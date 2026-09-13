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
- **Později:** generování textů přes **OpenRouter** (BE endpoint `POST /api/generate`, klíč v `.env`;
  přepínání modelů – běžný model např. ChatGPT, pro explicitní 18+ scény přepnout na Mistral Large; řešit modulem
  `ModelRouter` s konfigurací, flag mature na úrovni hry/uživatele, defaultně vypnuto, uživatelský přepínač
  režimu scény, ne regex klasifikace).
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
├── solo-rpg-be/            Fastify 5 + TS; .env: VAULT_PATH=../vault, PORT=3001
│   └── src/
│       ├── server.ts, config.ts
│       ├── routes/games.ts
│       └── vault/StorageProvider.ts (interface + NotFound/Conflict/ValidationError)
│                 ObsidianVaultProvider.ts (fs + gray-matter; CRUD postav, migrace npcs/ → characters/)
│                 sceneMarkdown.ts (parseEntries / serializeEntries / renameSpeaker)
│                 GameWatcher.ts (fs.watch recursive na složku otevřené hry → SSE `change` události)
│                 fsUtils.ts (assertInside, writeFileAtomic, safeFileName…)
├── solo-rpg-fe/            Vite + React 19 + react-router + Tailwind, lint = oxlint
│   └── src/
│       ├── pages/Home.tsx (seznam her přes API)
│       ├── pages/StoryEditor.tsx (přepnuto na API, scény, autosave nastavení s debounce)
│       ├── components/ CharacterBar, CharacterModal, SceneBar, SceneModal, ImageDropField (sdílené pole obrázku),
│       │               NarratorPickerModal (výběr aktuálního vypravěče), NarratorModal (formulář vypravěče),
│       │               SidePanel (aside se záložkami Nitě | Frakce), ThreadsPanel + ThreadModal (dějové nitě),
│       │               FactionsPanel + FactionModal (frakce), ChipGroup (chipy pro výčty), EntityChecklist (checklist entit),
│       │               InputArea, PortraitModal, StoryPanel
│       └── utils/ api.ts (API klient, ApiError), forms.ts (selectAll, inputClass), threads.ts / factions.ts (české popisky/barvy výčtů)
│                  (bývalý import z IndexedDB – legacyBrowserStorage/importLegacyGames – byl odstraněn, data jsou jen ve vaultu)
└── vault/                  výchozí VAULT_PATH (gitignored jako `/vault/` – POZOR, ne `vault/`, to by ignorovalo i src/vault) – otevřít v Obsidianu „Open folder as vault“
```

### Layout vaultu (na hru)
```
vault/<Název hry>/
  game.md                 frontmatter: name, createdAt, updatedAt, background, brightBackground, narrator (wikilink `[[Jméno]]` aktuálního vypravěče | null)
  characters/<Celé jméno>.md  frontmatter: id, name (celé), firstName, lastName, nickname, portrait, order;
                          tělo = markdown poznámky (editovatelné v modalu i v Obsidianu). PC i NPC bez rozlišení.
                          (stará složka npcs/ se při prvním čtení automaticky přejmenuje, `name` se rozdělí na jméno/příjmení)
  narrators/<Jméno>.md    frontmatter: id, name, portrait, order; tělo = markdown popis (description). Vypravěč = narrator,
                          do budoucna napojený na AI (OpenRouter). Nová hra nemá žádného; starý `dm{name,portrait}` v game.md
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
  scenes/001 - Název.md   frontmatter: id, title, order, image, characters (wikilinky `[[Celé jméno]]` postav ve scéně), createdAt, updatedAt
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
POST /api/games/:name/narrators              PUT/DELETE /api/games/:name/narrators/:id   ({ name, description?, image? })
GET/POST /api/games/:name/threads            PUT/DELETE /api/games/:name/threads/:id     (ThreadInput; title+type povinné)
GET/POST /api/games/:name/factions           PUT/DELETE /api/games/:name/factions/:id    (FactionInput; title+type povinné)
GET/POST /api/games/:name/quests             PUT/DELETE /api/games/:name/quests/:id      (QuestInput; title+type povinné)
POST /api/games/:name/assets (multipart: kind portrait|narrator|faction|background|scene, ownerName?, file)
POST /api/games/:name/assets/from-url ({ kind, url, ownerName? })
GET/POST /api/games/:name/scenes ({title, description?, image?, characters?})
GET(záznamy)/PUT(záznamy)/PATCH(meta)/DELETE /api/games/:name/scenes/:id
GET  /api/games/:name/events  (SSE: event `change`, data `{paths: string[]}` – změny souborů hry mimo BE)
GET  /vault/*  (statické soubory vaultu)
```

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
1. **OpenRouter endpoint** `POST /api/generate` (+ `ModelRouter`, SSE streaming, klíč v `.env`, mature flag) – napojit na
   vypravěče (`narrators/*.md`, description = systémový prompt / styl), aby AI vypravěč mohl řídit hru.
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
