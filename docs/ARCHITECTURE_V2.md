# Solo RPG – Architektura v2 (plán přestavby)

Tento dokument je výstup rozhovoru Lukáš ↔ Copilot (Claude Fable 5.1) z 6. 10. 2026. Je psaný „od Copilota pro Copilota“:
nová session z něj má vycházet, než začne cokoli měnit. Doplňuje `COPILOT_HANDOFF.md` (popis **současného** stavu v1);
tam, kde si odporují, platí tento dokument. Uživatel je Lukáš (@lukas2035), komunikuje **česky**, je fullstack.

Styl práce, který si Lukáš přeje: před zásadními rozhodnutími se **zeptat** (`ask_user`), jinak pracovat samostatně;
odpovídat stručně a upřímně, i když to znamená opravit dřívější tvrzení (viz MinIO níže).

---

## 0. TL;DR rozhodnutí

| Oblast | Rozhodnutí |
|---|---|
| Primární úložiště | **PostgreSQL v Dockeru** (image `pgvector/pgvector:pg17`), Drizzle ORM. Obsidian už **není** úložiště – jen jednosměrný export. |
| Datový model | Jedna tabulka `entities` (společné sloupce + `fields jsonb` per typ, `schema_version`), tabulka `links` (generické hrany), tabulka `events` (log). Validace Zod per `kind`. |
| Identita | Všude **ID** (`npc_…`, `loc_…` + nanoid). Jméno je měnitelné pole; doplňuje se jen pro UI a do promptu. |
| Assety | **Filesystem** (`./data/assets/<hash>`), rozhraní `AssetStore` tvarované podle S3; v cloudu `S3AssetStore` (Cloudflare R2). Žádné MinIO/RustFS/LocalStack. |
| Záloha | Dva soubory: `pg_dump` + ZIP složky `./data/assets` → OneDrive. Aplikační export hry (JSON + assety) až později kvůli SaaS. |
| AI | Dvě vrstvy: **Director** (rozhodovací, v kódu, deterministický) → `NarrativeBrief` → **Narrative** (LLM interpretuje) → `Suggestion` → Accept/Reject → extrakce stavu → `Patch` → event log. |
| Nasazení | Měsíce lokálně, pak SaaS se subscription. `tenant_id` ve schématu od začátku, auth/billing/metering až po tom, co Director prokáže, že je zábavný. |
| Zůstává | Fastify 5 + TS, Vite + React 19 SPA, `packages/shared` + Zod, npm workspaces, Windows/PowerShell 5 (`npm.cmd`, bez `&&`). |

---

## 1. Proč přestavba (motivace)

- Dnes AI jen pomáhá psát krátkou scénu; kontext jí Lukáš dává ručně. Hráč sám určuje questy, nebezpečí, cenu neúspěchu
  → pro **samostatné hraní** to nestačí.
- Cíl: každá entita (postava, nit, frakce, quest, lokace, lore, scéna…) umí **odkazovat na jakoukoli jinou** a má textovou
  část, kterou **aktualizuje AI** podle toho, co se v příběhu stalo. Aplikace připraví relevantní data, pošle AI,
  AI interpretuje do příběhu a z její odpovědi se aktualizuje stav dotčených entit.
- Obsidian jako obousměrné úložiště byl hlavní zdroj komplexity (`ObsidianVaultProvider.ts` ≈ 114 KB / ~150 funkcí:
  identita podle jména + wikilinky, kaskádové přejmenování souborů, zachování cizího frontmatteru, watcher, migrace).
  Lukáš **už na Obsidianu jako core úložišti netrvá** – stačí data prohlížet v appce a volitelně exportovat do vaultu.
- Do budoucna SaaS → potřeba multi‑tenant DB, relace, audit log, metering tokenů.

### Co v1 architektura neunese (diagnóza)
1. Identita podle jména – AI bude jména komolit/duplikovat; přejmenování = kaskáda přes soubory.
2. Vazby typované per dvojici (`Quest.characters`, `Faction.locations`, …) – N×N polí, každé s vlastním parserem a zpětným dopočtem.
3. `StorageProvider` má ~60 metod po typech – nová entita = 4 metody + provider + routa + FE util.
4. Chybí vrstva mezi úložištěm a promptem (`buildMessages` dostává hotové postavy; žádný výběr relevance, graf, token budget).

---

## 2. Technologie a infrastruktura

### 2.1 Docker Compose (root monorepa)
```yaml
services:
  db:
    image: pgvector/pgvector:pg17
    ports: ["5432:5432"]
    environment: { POSTGRES_USER: solo, POSTGRES_PASSWORD: solo, POSTGRES_DB: solo_rpg }
    volumes: ["./data/db:/var/lib/postgresql/data"]   # bind mount kvůli jednoduché záloze
```
- `npm run dev` má před startem BE pustit `docker compose up -d`.
- Docker Desktop na Windows: WSL2, nastavit autostart (jinak ranní `npm run dev` spadne na connection refused).
- Proč Docker a ne nativní Postgres: pgvector na Windows je bolest, pinnutá verze = stejná jako v produkci, reset `down -v`.
- Proč ne SQLite/PGlite: Lukášovi nevadí Docker na pozadí → nejkonzervativnější varianta bez přepisu dialektu.
  (PGlite byla alternativa, kdyby Docker vadil.)

### 2.2 Datová složka a záloha
```
./data/db/        Postgres (bind mount)
./data/assets/    soubory assetů podle content hashe (ab/cd/abcd….webp)
```
- **Záloha = dva soubory** do OneDrive (`scripts\backup.ps1`, ručně nebo Task Scheduler):
  1. `docker exec solo-db pg_dump -U solo -Fc solo_rpg > db-YYYYMMDD.dump` (konzistentní za běhu),
  2. `Compress-Archive .\data\assets assets-YYYYMMDD.zip`.
- Obnova: `pg_restore` + rozbalit. Zálohovat ZIPy, ne tisíce malých souborů (OneDrive).
- Alternativa: `docker compose stop` + zazipovat celé `./data` (vázané na verzi Postgresu).
- Aplikační export hry (JSON + assety, verzované schéma) **není teď potřeba**; přijde s nasazením (přenos do cloudu, „stáhnout má data“).

### 2.3 Assety
- Obrázky **nikdy do Postgresu**.
- DB tabulka `assets`: `id, tenant_id, game_id, kind (portrait|scene|background|emblem), mime, size, width, height, sha256, storage_key, created_at, deleted_at`.
  Entity odkazují `portraitAssetId` apod. `size` sčítat od začátku (kvóta pro subscription).
- Rozhraní navržené **podle S3, ne podle FS**, aby přechod byl jen výměna implementace:
  ```ts
  interface AssetStore {
    put(key: string, body: Buffer | Readable, meta: { contentType: string }): Promise<void>
    get(key: string): Promise<Readable>
    head(key: string): Promise<{ size: number; contentType: string } | null>
    delete(key: string): Promise<void>
  }
  ```
  Pravidla: klíč = content hash, neměnný; žádné rename/move; žádný `existsSync`/`readdir` v aplikační logice (seznam drží DB);
  metadata v DB; výdej `GET /api/assets/:id` streamem přes BE (v cloudu volitelně presigned URL – změna jedné routy).
- `FsAssetStore` (~50 řádků) teď, `S3AssetStore` (AWS SDK v3, R2; `requestChecksumCalculation: 'WHEN_REQUIRED'`) později,
  **oba proti stejné testovací sadě**.
- Při uploadu `sharp`: validace, resize (limit ~2048 px), náhled – lze odložit, ale rozhraní s tím počítat.
- Mazání: soft‑delete + GC nereferencovaných souborů (dedupe přes hash → stejný portrét ve dvou hrách = jeden soubor).
- Export do vaultu kopíruje soubory pod čitelnými názvy (`portraits/Klára Nováková.webp`) – čitelnost řeší export.

### 2.4 Historie rozhodnutí o lokálním S3 (aby se to neotvíralo znovu)
- MinIO: repozitář `minio/minio` má status **„no longer maintained“**, komunitní edice jen zdrojáky, Docker image bez aktualizací (ověřeno 6. 10. 2026). **Ne.**
- LocalStack: emuluje celý AWS, těžké, tlačí do placené verze. **Ne.**
- RustFS (Apache 2.0) / Garage (AGPL): funkční alternativy, ale pro jednoho hráče zbytečná služba a záloha by vyžadovala `rclone`. **Ne (zatím).**
- Rozdíly S3 vs. R2 vs. lokální servery jsou v okrajích (lifecycle, object lock, CORS, checksum hlavičky); jádro
  `Put/Get/Head/Delete/presign` je identické → stačí dodržet pravidla v 2.3.

---

## 3. Datový model

### 3.1 Tabulky
```sql
games     ( id, tenant_id, name, settings jsonb, created_at, updated_at, deleted_at )
entities  ( id, tenant_id, game_id, kind, name, aliases text[],
            fields jsonb, schema_version int,
            ai_state text,          -- text vlastněný AI („aktuální stav“)
            notes text,             -- text vlastněný uživatelem, AI nesahá
            created_at, updated_at, deleted_at )
links     ( id, game_id, from_id, to_id, kind, note, created_at )      -- generické hrany
events    ( id, tenant_id, game_id, scene_id, kind, payload jsonb, created_at )  -- neměnný log
assets    ( … viz 2.3 )
scene_entries ( id, game_id, scene_id, order, speaker_id, text, markdown bool, created_at )  -- repliky
scene_documents ( scene_id PK, game_id, doc jsonb, updated_at )  -- próza: text scény v režimu „textový editor“
```
- **Sloupec** = to, podle čeho se filtruje/joinuje nebo je společné všem. **JSONB** = per‑typ (stance, relations, clock, objectives…).
- Nová entita = nový `kind` + Zod schéma, **žádná DB migrace**. Zrušení = smazat schéma + řádky. Zásadní změna = nová verze schématu.
- Výhled: `pgvector` sloupec/tabulka pro paměť až když graf+recency nestačí. `tenant_id` zatím konstanta.
- Proč ne per‑typ tabulky: každá změna = migrace + ORM typ + repository; polymorfní FK pro hrany. Proč ne NoSQL: relace, event log,
  pgvector a jeden backup chceme v jedné DB; JSONB dává totéž „hoď tam dokument“.
- **Režim scény** (`fields.mode`): `play` = repliky v `scene_entries` + AI vypravěč; `prose` = souvislý text psaný jako v Notionu
  (TipTap/ProseMirror), uložený jako JSON strom v `scene_documents.doc` (`ProseDoc` ve shared). Obrázky v textu nesou v `attrs.src`
  odkaz do vaultu (`assets/<id>.<ext>`, kind `illustration`) a `attrs.layout` (`full` | `left` | `right` – obtékání textem); na URL se
  překládají až ve FE. Vzhled prózy je per scéna (`proseTexture` – kind `texture`, opakovaná pod textem; `proseTextColor` light/dark)
  a nová scéna ho dědí od předchozí. Do Obsidian vaultu se próza exportuje jednosměrně jako markdown (`vault/proseMarkdown.ts`).
  API: `GET/PUT /api/games/:game/scenes/:scene/prose`.
  AI v editoru: `POST …/prose/ai` (`ai/proseAi.ts`) ve dvou režimech. `continue` (prompt `prompts/prose-prompt.md`) dostane
  pokyn autora + celý dosavadní text bez obrázků (ořez zepředu na `AI_TRANSCRIPT_TOKENS`) a vrátí markdown, který FE připíše
  na konec editoru (`@tiptap/markdown`). `rewrite` (prompt `prompts/prose-rewrite-prompt.md`) dostane od FE markdown označeného
  úseku (výběr rozšířený na celé bloky; bez výběru celý text) + text před/za ním jako kontext (ořez na rozpočet) + volitelně
  předchozí nevyhovující pokus; vrátí jen nový úsek, FE ho ukáže jako slovní diff (`diff`) a po potvrzení jím nahradí původní
  (rozložení obrázků se podle `src` obnoví). Každé odeslání se uloží do historie scény `prosePrompts` jako
  `ProsePromptEntry { mode, prompt, response, createdAt }` (nejnovější první, max 50; FE: kopírovat pokyn i odpověď /
  znovu použít / smazat). Fields scény v9; staré řetězce se migrují na položky bez odpovědi (`legacyProsePrompts`, i pro vault).

### 3.2 Entita (shared typ, orientačně)
```ts
Entity {
  id: string            // 'npc_V1StGXR8', 'loc_…', 'thr_…', 'fac_…', 'qst_…', 'lor_…', 'scn_…', 'nar_…'
  kind: EntityKind
  name: string
  aliases: string[]     // pro resolver jmen z AI výstupu
  fields: unknown       // validuje Zod schéma per kind, verze schema_version
  notes: string         // uživatel
  aiState: { text: string; updatedAt: string; sourceSceneId: string | null }   // AI
  links: Link[]         // { to, kind?, note? } – dopočítané backlinky ve FE / dotazem
}
```
- Čitelné prefixy + nanoid: modelům se s nimi pracuje spolehlivěji než s UUID, snadný debug.
- Duplicitní jména se nezakazují (jen FE varování). Přejmenování = update jednoho řádku.
- Typovaná pole nechat jen tam, kde mají sémantiku (vůdce frakce, nadřazená lokace/quest); zbytek přes `links.kind`
  (`member`, `enemy`, `located_in`, `part_of`, `knows`, …).

### 3.3 Verzování a migrace `fields`
- Každé `kind` má `CURRENT_VERSION` a řetězec čistých funkcí `migrations[v]: (old) => new` (v → v+1).
- **Lazy** migrace při čtení (teď), **eager** skript při startu/deployi (před SaaS, aby šly staré migrace smazat).
- **Nikdy neztrácet informaci**: co nejde namapovat → `fields._legacy` nebo připojit do `notes`; volitelně AI „převeď starý popis
  do nových polí“ jako návrh ke schválení.
- ID a `links` migrace nemění; `events` se nechávají ve verzi vzniku (čtou se tolerantně).
- Disciplína: změna Zod schématu = `CURRENT++` + migrace **ve stejném commitu** + fixture `kind.vN.json` + test průchodu řetězcem.
  Během lokálního vývoje bez rozehrané kampaně je přípustné „smazat DB a reimportovat“.
- **Nikdy nečíst `fields` bez průchodu Zodem.**

---

## 4. AI – dvouvrstvá architektura

### 4.1 Director (rozhodovací vrstva) – uvnitř aplikace, nezávislá na RPG systému
Rozhoduje *co* se má stát z hlediska herní logiky a pacingu: pokračování vs. nový event; escalation / consequence / resolution;
typ eventu (obstacle / neutral / opportunity / reward); difficulty 1–5; stakes; intenzita; koho se týká; krátkodobé i dlouhodobé
směřování; významný story beat (zrada, odhalení, nová skutečnost).

- Používá **náhodné tabulky + weighted random**; AI dostane jen vybrané výsledky, ne tabulky.
- **Potřebuje stav, ne jen tabulky**: `CampaignPulse` (tension 0–10, fáze pacingu, dluh následků, počet beatů od posledního
  zvratu, otevřené nitě/questy, typ scény) – váhy tabulek se podle něj mění.
- **Konkrétní entity vybírá aplikace** (relevance / čerstvost / vazby), ne AI → brief obsahuje `npcId: npc_julia`, ne „existing NPC“.
- Čisté funkce, **seeded RNG**, unit testy; tabulky jako data (JSON v repu, později per žánr / uživatelsky editovatelné).
- Výstup: `NarrativeBrief` (strukturovaný objekt).
- **Rules adapter** (samostatný, volitelný): mapuje abstraktní difficulty 1–5 ↔ D&D DC / VtM Difficulty. Director o systému neví.

### 4.2 Narrative (interpretační vrstva) – externí LLM
- Neurčuje pravděpodobnosti, difficulty, stakes, typ eventu ani outcome, pokud ho stanovila aplikace.
- Z `NarrativeBrief` + kontextu kampaně generuje dialog NPC, popis scény, konkrétní podobu překážky/odměny/následku, pokračování.
- Výstup je **`Suggestion`**: `Accept` → kánon; `Reject` → pole „Why?“ → důvod jde do dalšího pokusu.
- **Důvod rejectu je kánon**: „Julia není Klářina kamarádka“ je fakt o světě → uložit jako constraint k entitě / do `notes`
  (po potvrzení), ne jen do příštího promptu.
- Modely přes stávající `ai/provider.ts` (OpenRouter / Mistral); přidat **structured output** (JSON schema / tool calling).
  Levný model na extrakci, drahý na prózu.

### 4.3 Beat jako stavový automat
```
Brief → Suggestion → Accept
      → [hráč hodí podle svého systému; adapter: difficulty→DC]
      → Outcome (success | partial | fail)
      → Consequence Brief → Suggestion → Accept → …
```
Po každém Acceptu:
1. **Extrakce stavu** – druhé volání se structured outputem → pole `Patch`
   (`{ entityId | newEntity, aiStateText, links +/-, fieldChanges }`), validace Zodem.
2. Nízkorizikové patche (přidat vazbu) auto‑apply; vysokorizikové (změna statusu, smrt NPC, nová entita) k potvrzení (diff UI).
3. Vše do `events` → stav entity lze rekonstruovat, uživatel vidí „proč si to AI myslí“, undo.
AI **nikdy nezapisuje přímo**.

*(Stav: smyčka Brief → Accept → Outcome → Consequence je realizována jako `DirectorEvent` persistovaný u scény – beat
`rollPhase: before` zastaví před hodem, další beat `after` čeká na `outcome`, beat `resolution` událost uzavře. Extrakce stavu
(body 1–3) zatím jen u questů – návrhy po shrnutí scény.)*

### 4.4 Kontext pro AI (největší technické riziko)
- `ContextBuilder` nad **in‑memory indexem hry** (načíst jednou, invalidovat při zápisu), ne čtení z úložiště per request.
  *(Krok 2 zatím staví graf z `getGame()` per request – čistá funkce nad `GameDetail`; index až když bude výkon bolet.)*
- Výběr: entity scény → graf do hloubky N → váha relevance (hrany, recency, otevřené nitě) → token budget → ořez.
- Do promptu **ID i jméno** (`Julia Kreuzová (id: npc_julia)`); ve structured outputu vyžadovat ID.
- Resolver zpět: `id → přesné jméno → alias → fuzzy shoda s potvrzením uživatele → nová entita`.
- Využít existující scene summaries. `pgvector` až když to nestačí.

### 4.5 Hranice systém ↔ AI (shrnutí)
Uvnitř (DB, links, events, API, FE state, repliky `speakerId`) jen ID. Jména se doplňují až pro UI a pro prompt.
Obsidian export odvozuje názvy souborů a wikilinky ze jmen při generování.

---

## 5. Cílová struktura BE
```
solo-rpg-be/src/
  domain/      Entity, Link, Event – čisté typy + graf index (bez IO)
  director/    pulse, tabulky (data), briefBuilder – čisté funkce, seeded RNG, testy
  narrative/   contextBuilder, prompty, suggestion lifecycle, stateExtractor (patche)
  storage/     Postgres (drizzle schema + repository), FsAssetStore, ObsidianExporter (jednosměrný)
  ai/          provider.ts, openRouter.ts, mistral.ts (zůstává) + structured output
  routes/      generické /games/:gameId/entities?kind=…, /assets, /ai/…
```
**Vypadne:** `GameWatcher`, nativní dialogy (`system/dialogs.ts`), `VaultManager`, `x-vault-path`, ~90 % `ObsidianVaultProvider`,
`sceneMarkdown`/`sessionsMarkdown` (zůstanou jen jako součást importéru/exportéru).
`StorageProvider` se zúží na generické `getEntity / listEntities(kind) / saveEntity / patchEntities(batch) / …`.

FE: `utils/api.ts` přejde na generické entity endpointy; `vaultPath.ts`, `VaultGate`, `VaultSetup` vypadnou (cesta k exportu je nastavení).

---

## 6. Pořadí prací (nic nebourat najednou)

> **Stav (8. 10. 2026):** kroky 1, 2 i 3 jsou implementované.
> *Krok 1* (`solo-rpg-be/src/storage/*`: schéma, `PostgresProvider` nad v1
> rozhraním `StorageProvider`, `FsAssetStore`, `VaultImporter`, `ObsidianExporter`, migrace v `solo-rpg-be/drizzle/`,
> testy `solo-rpg-be/test/`, `scripts/backup.ps1`). FE beze změny – stále mluví jmény; překlad jméno ↔ id dělá
> `PostgresProvider` (`Snapshot`). `ObsidianVaultProvider` zůstává jen jako čtečka pro import a zapisovač pro export.
> Složka vaultu v UI („Změnit složku“) teď znamená *kam exportovat*. `GameWatcher` je nahrazen `NoopNotifier` (SSE jen heartbeat).
> Záloha/obnova ověřena (včetně obnovy do úplně prázdné DB). Obě hry importované z `c:\Lukas\ttrpg games` (vault zůstává jako v1 záloha).
> *Krok 2* (`solo-rpg-be/src/narrative/contextBuilder.ts` + `suggestions.ts`, routy `…/scenes/:id/ai*`, FE `AiSuggestionPanel`):
> AI vypravěč už **neukládá rovnou**, vrací `AiSuggestion`, kterou hráč v panelu pod scénou upraví (text, mluvčí, smazat řádek) a
> přijme / odmítne (s důvodem → důvody jdou do dalšího pokusu, max 5) / zkusí znovu. Stav návrhu je in‑memory per scéna
> (restart BE = ztráta, FE si ho načte přes GET). Každý krok (`ai.suggestion.created/accepted/rejected`) je první zapisovač do `events`.
> `ContextBuilder` = čistá funkce nad `GameDetail` (graf podle jmen, BFS hloubka 2 od postav + lokace scény, skóre vzdálenost/recency/stav,
> token budget `AI_CONTEXT_TOKENS` 12k při 3,5 zn/token, 30 % na shrnutí předchozích scén, tajemství v oddělené sekci
> „Tajemství (hráč nezná)“, entity v promptu s `(id: …)`), přepis ořezaný od nejstarších (`AI_TRANSCRIPT_TOKENS` 8k).
> Rozhodnutí z `ask_user`: bez streamingu; reject‑důvod se zatím neváže na entity (až krok 4); žádný in‑memory index hry
> (stačí `getGame` per request – řeší se, až to bude bolet). Testy: `test/contextBuilder.test.ts` (bez DB), `test/suggestions.test.ts` (Postgres, AI mock).
> **Teď:** play‑test kroku 2 s reálným Mistralem – ověřit, že delší prompt (kontext + tajemství + odmítnuté návrhy) nezhorší
> kvalitu odpovědí, doladit váhy skóre v `contextBuilder.ts`.
> *Krok 3* (`solo-rpg-be/src/director/*`, routy `…/scenes/:id/director*`, FE `DirectorPanel` + 🎬 v `InputArea`, select systému
> pravidel v `RulesModal`): `CampaignPulse` se počítá z dat (nitě, questy, hodiny, historie beatů z `events`) s ruční korekcí
> `GameSettings.pulseOverride`; seedované tabulky `tables/director-tables.json` → `NarrativeBrief`; rules adapter v1
> (`GameSettings.rulesSystem`) jen překládá obtížnost 1–5, hráč hází sám a zadá výsledek. Rozhodnutí z `ask_user`: **viditelný krok**
> (brief se ukáže před psaním, lze přehodit/upravit/přeskočit), puls automaticky + ruční přepis, jednoduchý adapter bez
> implementace mechanik. Brief in‑memory per scéna, spotřebuje se přijetím návrhu (`director.beat.accepted`). Detaily v `COPILOT_HANDOFF.md` § Director v1.
> **Další krok: 4** (Extrakce → Patch → events) – po přijetí návrhu AI navrhne `Patch` (stav nití/questů, hodiny, nové entity),
> hráč schválí v panelu; teprve pak zápis + event. Před tím play‑test Directoru s reálným modelem.
>
> **Stav (12. 10. 2026) – odchylky od plánu po play‑testu:**
> - **Režim AI per scéna** `SceneMeta.aiMode: 'basic' | 'advanced'` (dědí se do nové scény, první scéna `basic`). *basic* = jen prompt
>   vypravěče + popis scény + přepis (chování v1, bez `ContextBuilder`, Directoru i pulsu); *advanced* = celý pipeline z § 4.
>   Dokument výše předpokládá vždy plný pipeline – pro krátké / vedlejší scény to Lukáš nechce. Krok 4 se týká **jen advanced**.
> - Nastavení přesunutá ze hry do scény (dědí se ze sousední scény): `rulesInAi` (migrace `0002`), `darkBackground` (migrace `0004`).
>   `GameSettings` už nemá `brightBackground` ani `rulesInAi`.
> - `DirectorEvent` (rozehraná událost + beaty) je **vázaný na scénu** (`SceneFields.director`), nepřenáší se do další scény;
>   `CampaignPulse` se počítá pro celou kampaň (z dat + `GameSettings.pulseOverride`). Dialog 🤖 AI v advanced ukazuje `DirectorSummary`.
> - **Prompt hráče pro AI** (`POST …/ai { prompt }`): jednorázový pokyn pro jedno volání (sekce „Pokyn hráče pro tento krok“).
>   Do scény se ukládá jako replika `kind: 'prompt'` (bez mluvčího) až s první přijatou replikou; AI texty mají `ai: true` +
>   `promptId`. `scene_entries` má tedy navíc `speaker_kind = 'prompt'`, `ai`, `prompt_id` (migrace `0003`). Prompty se nikdy
>   neposílají do AI přepisu, shrnutí ani exportu.
> - Hráč zadává do advanced smyčky také `outcome` hodu ručně (rules adapter zůstává jen překlad obtížnosti) – beze změny proti kroku 3.
>
> **Z plánu zatím neimplementováno** (nad rámec kroku 4): structured output v `ai/provider.ts` (quest návrhy se parsují z JSON
> bloku v textu); resolver jmen a `entities.aliases` (sloupec existuje, nic ho neplní); `entities.ai_state` a `deleted_at`
> (sloupce bez logiky – soft‑delete se nedělá); reject‑důvod → constraint u entity; assety bez `sharp`, dedupe GC a kvót;
> eager migrace `fields` + fixture testy per verzi; úklid v1 z § 5 (`GameWatcher`, `VaultManager`, `x-vault-path`,
> `system/dialogs.ts`, `routes/vault.ts`, FE `VaultGate`/`VaultSetup`/`vaultPath`) stále v repu, `StorageProvider` má ~47 metod
> po typech, žádné generické `/entities?kind=` routy, FE `api.ts` mluví jmény; krok 5 (SaaS) jen `tenant_id` konstanta.

1. **Model + úložiště**: `shared` schémata (Entity/Link/Event/Brief/Suggestion/Patch, per‑kind Zod + verze), Drizzle schéma,
   `docker-compose.yml`, `FsAssetStore`, **importér ze stávajícího vaultu** (ať nepřijdeš o hry; mapování je v
   `COPILOT_HANDOFF.md` § Layout vaultu), `ObsidianExporter`, `scripts\backup.ps1`. FE přepnout na nové API při zachování UI.
2. ~~**Smyčka Suggestion/Accept/Reject + ContextBuilder** na *dnešním* scénovém módu~~ – hotovo (viz Stav).
3. **Director v1**: `CampaignPulse` + 3–4 tabulky + `NarrativeBrief` + rules adapter (1–5 ↔ DC).
4. **Extrakce → Patch → events**, diff UI, resolver jmen, reject‑reason → constraint.
5. Příprava na SaaS: auth, metering tokenů per uživatel, kvóty assetů, eager migrace, aplikační export/import hry, `S3AssetStore` (R2), billing.

Před každým krokem: krátký návrh → `ask_user` na sporné body → implementace → testy (director a migrace jsou povinně testované).

---

## 7. Otevřené otázky (zeptat se, až budou na řadě)
- Přesný seznam `kind` v2 a která typovaná pole přežijí vs. přejdou na `links.kind`.
- ~~Konkrétní podoba `CampaignPulse` a první sada tabulek~~ – v1 hotovo (`director/pulse.ts`, `tables/director-tables.json`); otevřené: per žánr / editovatelné hráčem.
- Které patche jsou „nízkorizikové“ (auto‑apply) – odsouhlasit seznam (krok 4).
- Zda má krok 4 (extrakce stavu) běžet i nad `basic` scénami (alespoň shrnutí + questy), nebo striktně jen `advanced`.
- Kdy začít úklid v1 (§ 5) – samostatný krok mezi 4 a 5, nebo až s přechodem FE na generické entity endpointy?
- ~~Zda scény zůstávají samostatnou entitou s replikami v `scene_entries`~~ – zůstávají (`scene_entries` + `events` jen jako log).
- Granularita exportu do Obsidianu (celá hra při kliknutí vs. průběžně).
- Lokalizace: UI česky, AI prompty česky/anglicky? (dnes česky)
