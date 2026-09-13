# Kontext pro Copilota (Claude Fable 5.1) – projekt Solo RPG

Tento text je předávací zpráva „od tebe pro tebe“. Napsal ji Claude Fable 5.1 v předchozí session
(otevřené nad `solo-rpg-fe`), aby nová session nad monorepem `c:\development\solo-rpg` věděla, co se udělalo,
proč, a co je v plánu dál. Přečti si ho celý, než začneš cokoli měnit. Uživatel je Lukáš (@lukas2035),
komunikuje **česky**, je fullstack (React i Java/Spring Boot na stejné úrovni).

---

## 1. Vize projektu (co Lukáš chce)

- Aplikace **Solo RPG** = správce sólového hraní RPG. Dnes: editor příběhu (scény, repliky postav a vypravěče/DM,
  portréty, pozadí). Do budoucna: NPC, questy, lokace atd.
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
│                           ImageRef, Character, Dm, GameSetup, GameMeta, GameDetail, SceneMeta, StoryEntry,
│                           AssetKind/AssetResponse, isValidGameName, INVALID_GAME_NAME_CHARS, isRemoteImage
├── solo-rpg-be/            Fastify 5 + TS; .env: VAULT_PATH=../vault, PORT=3001
│   └── src/
│       ├── server.ts, config.ts
│       ├── routes/games.ts
│       └── vault/StorageProvider.ts (interface + NotFound/Conflict/ValidationError)
│                 ObsidianVaultProvider.ts (fs + gray-matter; CRUD postav, migrace npcs/ → characters/)
│                 sceneMarkdown.ts (parseEntries / serializeEntries / renameSpeaker)
│                 fsUtils.ts (assertInside, writeFileAtomic, safeFileName…)
├── solo-rpg-fe/            Vite + React 19 + react-router + Tailwind, lint = oxlint
│   └── src/
│       ├── pages/Home.tsx (seznam her přes API + tlačítko „Přenést hry z prohlížeče do vaultu“)
│       ├── pages/StoryEditor.tsx (přepnuto na API, scény, autosave nastavení s debounce)
│       ├── components/ CharacterBar, CharacterModal (nový), SceneBar, DmSettingsModal, InputArea, PortraitModal, StoryPanel
│       └── utils/ api.ts (API klient, ApiError), importLegacyGames.ts,
│                  legacyBrowserStorage.ts (bývalé setupStorage.ts – IndexedDB, jen pro jednorázový import)
└── vault/                  výchozí VAULT_PATH (gitignored jako `/vault/` – POZOR, ne `vault/`, to by ignorovalo i src/vault) – otevřít v Obsidianu „Open folder as vault“
```

### Layout vaultu (na hru)
```
vault/<Název hry>/
  game.md                 frontmatter: name, createdAt, updatedAt, background, brightBackground, dm{name,portrait}
  characters/<Celé jméno>.md  frontmatter: id, name (celé), firstName, lastName, nickname, portrait, order;
                          tělo = markdown poznámky (editovatelné v modalu i v Obsidianu). PC i NPC bez rozlišení.
                          (stará složka npcs/ se při prvním čtení automaticky přejmenuje, `name` se rozdělí na jméno/příjmení)
  portraits/<Celé jméno>.png   (_dm.png pro vypravěče)
  backgrounds/<soubor>
  scenes/001 - Název.md   frontmatter: id, title, createdAt, updatedAt
                          záznamy: <!-- entry id="..." ts="..." --> + **[[Celé jméno|nickname]]**: text  |  **DM**:\n víceřádkový text
```
Parser scén dělí i ručně dopsané záznamy bez markeru podle řádků `**Jméno**:` – wikilink `[[..]]` vždy,
plain jméno jen pokud je to známý mluvčí (celé jméno nebo nickname), aby `**Důležité**:` v DM odstavci nebyl nový mluvčí.
Víceřádkový text → `markdown: true`. `StoryEntry.characterName` = celé jméno; alias v odkazu je nickname.
Přejmenování postavy / změna nicku na BE přepíše hlavičky mluvčího ve všech scénách a přejmenuje portrét.

### Postavy (FE)
- „+“ v pásu i klik na postavu otevře `CharacterModal`: Jméno, Příjmení, Nickname (sleduje křestní jméno, dokud ho
  uživatel nepřepíše), portrét (klik/drop/URL), markdown poznámky. Fokus/Tab označí celý text. Enter odešle, Esc zavře.
- Submit: `POST/PUT /characters` (409 při duplicitním celém jménu → hláška v dialogu) → `storeImage(kind portrait, celé jméno)`
  → `PUT` s cestou portrétu. Postavy se **neukládají přes setup autosave** (ten jen pozadí + DM).
- Mluvčí dopsaný v Obsidianu bez souboru postavy = dočasná postava (`id: tmp-…`); klik na ni otevře dialog a vytvoří soubor.
- V UI (pás, taby, repliky) se zobrazuje nickname.

### API (BE, port 3001; Vite proxy přesměrovává `/api` a `/vault` z 5173)
```
GET  /api/health
GET/POST /api/games            GET/PATCH(rename)/DELETE /api/games/:name
PUT  /api/games/:name/setup    (jen backgroundImage, brightBackground, dm)
POST /api/games/:name/characters             PUT/DELETE /api/games/:name/characters/:id
POST /api/games/:name/assets (multipart)     POST /api/games/:name/assets/from-url
GET/POST /api/games/:name/scenes             GET/PUT/DELETE /api/games/:name/scenes/:id
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

## 4. Spuštění
```
cd c:\development\solo-rpg
npm.cmd run dev          # BE http://127.0.0.1:3001 + FE http://localhost:5173
```

## 5. Co je DALŠÍ na řadě (Lukáš ještě nevybral, zeptej se)
1. **OpenRouter endpoint** `POST /api/generate` (+ `ModelRouter`, SSE streaming, klíč v `.env`, mature flag).
2. **Další typy poznámek ve vaultu:** lokace (`locations/*.md`), questy (`quests/*.md`), rozšíření postav
   (např. typ PC/NPC, vztahy) – postavy už mají vlastní dialog a CRUD.
3. Případně `chokidar` sledování vaultu (live reload při editaci v Obsidianu) – zatím se načítá tlačítky 💬 / 📂.
4. ~~Git init monorepa~~ – hotovo, repo je na GitHubu.

## 6. Pracovní konvence z minulé session
- Odpovídat česky, stručně; komentáře v kódu česky.
- Před většími kroky krátce vysvětlit přístup; plán držet v todos.
- Po změnách vždy `npm.cmd run build` + `lint` z rootu; API testovat Node skriptem.
- Neměnit nesouvisející kód; FE styl: Tailwind, funkční komponenty, typy z `@solo-rpg/shared`.
