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
```
- **Sloupec** = to, podle čeho se filtruje/joinuje nebo je společné všem. **JSONB** = per‑typ (stance, relations, clock, objectives…).
- Nová entita = nový `kind` + Zod schéma, **žádná DB migrace**. Zrušení = smazat schéma + řádky. Zásadní změna = nová verze schématu.
- Výhled: `pgvector` sloupec/tabulka pro paměť až když graf+recency nestačí. `tenant_id` zatím konstanta.
- Proč ne per‑typ tabulky: každá změna = migrace + ORM typ + repository; polymorfní FK pro hrany. Proč ne NoSQL: relace, event log,
  pgvector a jeden backup chceme v jedné DB; JSONB dává totéž „hoď tam dokument“.

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

### 4.4 Kontext pro AI (největší technické riziko)
- `ContextBuilder` nad **in‑memory indexem hry** (načíst jednou, invalidovat při zápisu), ne čtení z úložiště per request.
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

> **Stav (6. 10. 2026):** krok 1 je implementovaný (`solo-rpg-be/src/storage/*`: schéma, `PostgresProvider` nad v1
> rozhraním `StorageProvider`, `FsAssetStore`, `VaultImporter`, `ObsidianExporter`, migrace v `solo-rpg-be/drizzle/`,
> testy `solo-rpg-be/test/`, `scripts/backup.ps1`). FE beze změny – stále mluví jmény; překlad jméno ↔ id dělá
> `PostgresProvider` (`Snapshot`). `ObsidianVaultProvider` zůstává jen jako čtečka pro import a zapisovač pro export.
> Složka vaultu v UI („Změnit složku“) teď znamená *kam exportovat*. `GameWatcher` je nahrazen `NoopNotifier` (SSE jen heartbeat).
> Další krok: 2.

1. **Model + úložiště**: `shared` schémata (Entity/Link/Event/Brief/Suggestion/Patch, per‑kind Zod + verze), Drizzle schéma,
   `docker-compose.yml`, `FsAssetStore`, **importér ze stávajícího vaultu** (ať nepřijdeš o hry; mapování je v
   `COPILOT_HANDOFF.md` § Layout vaultu), `ObsidianExporter`, `scripts\backup.ps1`. FE přepnout na nové API při zachování UI.
2. **Smyčka Suggestion/Accept/Reject + ContextBuilder** na *dnešním* scénovém módu – rychlá výhra, otestuje UX.
3. **Director v1**: `CampaignPulse` + 3–4 tabulky + `NarrativeBrief` + rules adapter (1–5 ↔ DC).
4. **Extrakce → Patch → events**, diff UI, resolver jmen, reject‑reason → constraint.
5. Příprava na SaaS: auth, metering tokenů per uživatel, kvóty assetů, eager migrace, aplikační export/import hry, `S3AssetStore` (R2), billing.

Před každým krokem: krátký návrh → `ask_user` na sporné body → implementace → testy (director a migrace jsou povinně testované).

---

## 7. Otevřené otázky (zeptat se, až budou na řadě)
- Přesný seznam `kind` v2 a která typovaná pole přežijí vs. přejdou na `links.kind`.
- Konkrétní podoba `CampaignPulse` a první sada tabulek (žánrově neutrální vs. per hra).
- Které patche jsou „nízkorizikové“ (auto‑apply) – odsouhlasit seznam.
- Zda scény zůstávají samostatnou entitou s replikami v `scene_entries`, nebo repliky jdou do `events`.
- Granularita exportu do Obsidianu (celá hra při kliknutí vs. průběžně).
- Lokalizace: UI česky, AI prompty česky/anglicky? (dnes česky)
