# Solo RPG

Monorepo pro správce sólového RPG hraní. Data (postavy, scény, obrázky) se ukládají
do **Obsidian vaultu** jako Markdown soubory, takže je lze číst i upravovat přímo v Obsidianu.

## Struktura

| Složka | Popis |
|---|---|
| `solo-rpg-fe/` | React + Vite + Tailwind – herní UI |
| `solo-rpg-be/` | Fastify (Node + TypeScript) – lokální API, zápis do vaultu |
| `packages/shared/` | Sdílené typy a zod schémata (FE ↔ BE) |
| `vault/` | Výchozí Obsidian vault s hrami (gitignored) |

## Spuštění (lokálně)

Požadavky: Node.js 22+ a npm 10+.

```bash
npm install
cp solo-rpg-be/.env.example solo-rpg-be/.env   # lokální konfigurace BE (není v gitu)
npm run dev        # spustí BE (http://127.0.0.1:3001) i FE (http://localhost:5173)
```

> Na Windows s vypnutým spouštěním PowerShell skriptů použij `npm.cmd`.

Konfigurace BE je v `solo-rpg-be/.env` (viz `.env.example`):

```
VAULT_PATH=../vault   # výchozí složka s hrami – lze ji přepnout v prohlížeči (viz níže)
PORT=3001
OPENROUTER_API_KEY=   # klíč z https://openrouter.ai/keys – bez něj je AI vypravěč vypnutý
OPENROUTER_MODEL=mistralai/mistral-large-2512
AI_PROMPT_PATH=prompts/scene-prompt.md   # výchozí prompt pro vedení scény (uprav si ho podle sebe)
```

### Složka s hrami a zálohy

- Při prvním spuštění se aplikace zeptá, **ve které složce mají být uložené hry** (každá hra = podsložka; složku lze
  otevřít v Obsidianu jako vault). Volba se uloží do `localStorage` prohlížeče (`solo-rpg:vault-path`) a při dalších
  spuštěních se použije automaticky; na úvodní stránce ji lze změnit („Změnit složku“ v zápatí). Hodí se to i proto,
  aby složka s hrami neležela v projektu a IDE do ní nekoukalo.
- Na Windows BE otevře nativní dialog pro výběr složky / „Uložit jako“ (přes PowerShell + WinForms); jinde se cesta zadává
  ručně. FE posílá cestu s každým požadavkem (hlavička `x-vault-path`, u SSE a obrázků query `?vault=`) a BE podle ní
  přepíná otevřený vault.
- **Zálohovat hru** na úvodní stránce: vyber hru → dialog „Uložit jako“ s předvyplněným názvem
  `<hra> YYYY-MM-DD_HH-mm.zip` → celá složka hry se zabalí do zipu (`archiver`).
- **Export hry do textu** – tlačítko 📄 v horní liště otevřené hry stáhne `<hra>.md`: jeden Markdown soubor
  s vypravěči, postavami, lokacemi, frakcemi, questy, nitěmi, lore a přepisem všech scén (včetně shrnutí a tajemství).
  Jen text – obrázky se vynechají, wikilinky se převedou na prostý text. Hodí se jako kontext pro ChatGPT / Gemini.

### AI vypravěč (OpenRouter)

- 🤖 v horním pásu otevře nastavení AI pro **aktuální scénu**: zapnutí, rozdělení postav scény na „hraju já“ / „hraje AI“,
  volitelný **doplňující popis situace** (shrnutí jen pro AI, vloží se za popis scény) a tlačítko „Nechat AI pokračovat“.
  Ukládá se do frontmatteru scény (`ai`, `aiCharacters`, `aiPrompt`); nová scéna dědí z poslední zapnutí a AI postavy (ne popis).
- Odpovídá vždy **aktuální vypravěč** (🎭). Každý vypravěč má vedle popisu i vlastní **AI prompt** (v souboru za značkou
  `<!-- ai-prompt -->`), který se připojí na konec požadavku.
- Požadavek = `prompts/scene-prompt.md` (system) + postavy hráče a AI s popisy + popis scény + celý dosavadní průběh scény
  (formát jako 📋 kopírování) + prompt vypravěče. Odpověď ve tvaru `Jméno: text` se rozparsuje na záznamy a uloží do scény.
- V AI módu odpoví vypravěč po každém tvém záznamu; AI postavy jsou v pásu označené 🤖 AI.
- **Shrnutí děje scény**: dialog scény (✏️) má víceřádkové markdown pole „Shrnutí děje scény“ – rychlý kontext pro tebe
  i AI. Tlačítko „🤖 Shrnout pomocí AI“ pošle přepis scény stejnému modelu s promptem `prompts/scene-summary-prompt.md`
  (`AI_SUMMARY_PROMPT_PATH`) a výsledek vloží do pole; uloží se až tlačítkem „Uložit“ (do souboru scény za značku `<!-- summary -->`).
- **Kostky a pravidla pod příběhem**: tlačítko 🎲 v horní liště otevře dialog s markdown popisem pravidlového systému,
  který pod příběhem používáš (VtM 5e, D&D 5e, Fate…, případně vlastní tabulka pro výklad orákula), a zaškrtávátkem
  „Posílat informace o kostkách a pravidlech AI“. Se zapnutým přepínačem se ke každému AI požadavku (vypravěč i shrnutí
  scény) připojí prompt `prompts/rules-prompt.md` (`AI_RULES_PROMPT_PATH`) vysvětlující, že si házíš kostkami jako orákulem
  a výsledky zapisuješ do textu, plus tvůj popis pravidel. S vypnutým přepínačem se AI o kostkách neposílá vůbec nic
  (čistě příběhové scény). Do textového exportu hry (📄) jdou pravidla vždy.
  Popis se ukládá do `game.md` za značku `<!-- rules -->` (tvé poznámky nad ní zůstávají), přepínač jako `rulesInAi`.

### Herní sezení (stopky)

- ⏱️ v horním pásu otevře dialog sezení: **stopky** (spustit / pauza / pokračovat / reset), **zábavnost 0–10 po půl stupních**
  (hvězdičky nebo posuvník) a nepovinný **popis**, jak sezení bavilo. Sezení není vázané na scénu – běží v reálném čase,
  přežije zavření dialogu i obnovení stránky (localStorage per hra); tlačítko svítí zeleně za běhu, oranžově v pauze.
- „💾 Uložit sezení“ zapíše datum, délku, hodnocení a popis do `sessions.md` ve složce hry a stopky vynuluje. V dialogu je
  i historie všech sezení (celkový čas, průměrná zábavnost, úprava hodnocení/popisu, smazání).

Další příkazy: `npm run build` (typecheck + build všech workspaces), `npm run lint` (oxlint FE).

## Struktura vaultu

```
vault/
└── <Název hry>/
    ├── game.md              # nastavení hry (frontmatter) + volné poznámky
    ├── sessions.md          # herní sezení (stopky): souhrn + blok na sezení (začátek, konec, délka v s, zábavnost, popis)
    ├── characters/<Celé jméno>.md  # jedna postava (PC i NPC) = jeden soubor (frontmatter + markdown poznámky)
    ├── narrators/<Jméno>.md  # vypravěči (narrator) – jméno + markdown popis; aktuální vypravěč je v game.md (`narrator: [[Jméno]]`)
    ├── threads/<Název>.md   # dějové nitě (threads) – otevřené komplikace, hrozby, záhady… (frontmatter + markdown popis)
    ├── factions/<Název>.md  # frakce – organizace ve světě (frontmatter + markdown popis, tajemství za `<!-- secrets -->`)
    ├── locations/<Název>.md # lokace – hierarchická místa světa (`parentLocation`), popis + tajemství za `<!-- secrets -->`
    ├── lore/<Název>.md      # lore – encyklopedie světa (historie, legendy, náboženství…), obsah + skutečná pravda za `<!-- secrets -->`
    ├── portraits/           # portréty postav podle celého jména; portraits/narrators/ = vypravěči, portraits/factions/ = emblémy frakcí, portraits/locations/ = obrázky lokací
    ├── backgrounds/         # pozadí hry + obrázky scén (podle názvu scény)
    └── scenes/001 - Název.md  # scény = popis + záznamy příběhu
```

Formát scény (frontmatter `title`, `image`, `characters` = wikilinky postav přítomných ve scéně; tělo = markdown popis, volitelně značka `<!-- summary -->` + shrnutí děje, značka `<!-- entries -->`, záznamy):

```markdown
Popis scény v markdownu (upravuje se v dialogu scény i v Obsidianu).

<!-- summary -->

Shrnutí děje scény (ručně nebo od AI) – co se stalo, klíčové body, otevřené otázky.

<!-- entries -->

<!-- entry id="1700000000000" ts="1700000000000" -->
**[[Aria Stormwind|Aria]]**: Jednořádková replika postavy.

<!-- entry id="1700000000001" ts="1700000000001" -->
**[[Kronikář]]**:
Víceřádkový markdown vypravěče.
```

Postavy jsou wikilinky na soubory v `characters/` (celé jméno) s aliasem = nickname, vypravěči wikilinky na soubory
v `narrators/`. Můžeš dopisovat záznamy
i ručně v Obsidianu (`**[[Celé jméno]]**: text` nebo `**Nickname**: text`) – aplikace změnu souborů zaznamená
(BE sleduje složku hry) a nabídne tlačítko „Načíst aktuální stav“.
Soubor scény bez značky `<!-- entries -->` se čte celý jako záznamy (starý formát); záznamy `**DM**:` / `**Vypravěč**:`
se čtou jako vypravěč bez souboru.
Nová hra nemá žádného vypravěče – vytvoří se tlačítkem „Zadat vypravěče“ (bez vypravěče nelze psát jeho text).
Starší hry s `dm` v `game.md` se při otevření automaticky převedou na soubor v `narrators/`.
Aplikace při zápisu zachovává vlastní frontmatter klíče a tělo poznámek u postav i hry.
Přejmenování postavy v aplikaci přejmenuje soubor, portrét i odkazy ve scénách; přejmenování scény
přejmenuje její soubor i obrázek.

### Dějové nitě (threads)

Dějová nit je otevřená nitka příběhu, která může později něco způsobit – komplikace, hrozba, záhada, příležitost,
závazek nebo vztah. Panel 🧵 v horním pásu zobrazí otevřené nitě (skryté / aktivní / eskalované), vyřešené a vyhaslé jsou
sbalené v archivu; filtrovat lze podle typu, stavu, horizontu a jistoty, hledat podle názvu. Stav a hodiny (±1) se mění
přímo v seznamu, klik na název otevře detail.

```yaml
---
id: thread-1700000000000
title: Kamera u Phoenixu
type: complication        # complication | threat | mystery | opportunity | obligation | relationship
status: latent            # latent | active | escalated | resolved | expired
horizon: short-term       # immediate | short-term | long-term
certainty: unresolved     # confirmed | unresolved (zatím není jisté, zda se to ve fikci opravdu stalo)
revealCondition: Někdo si prohlédne záznam z kamery.   # jen popis, nic se neděje automaticky
clock:                    # volitelné hodiny postupu/eskalace, ručně spravované
  current: 1
  max: 4
characters:
  - '[[Marek Novák]]'
scene: '[[Vloupání]]'     # scéna, ve které nit vznikla (volitelné)
---

Markdown popis nitě – co představuje a proč vznikla.
```

Hodnoty výčtů jsou v souboru stabilní anglické klíče, UI zobrazuje české popisky. Vazby jsou wikilinky podle názvu
(stejně jako u scén); přejmenování/smazání postavy nebo scény se do nití propíše automaticky. Přejmenování nitě
přejmenuje soubor, `id` zůstává. Zpětné vazby (postava → nitě) se dopočítávají, nikam se neduplikují.
Nit může mít i `factions: ['[[Název frakce]]']` – frakce pak na svém detailu zobrazí související nitě.

### Frakce (factions)

Frakce je organizovaná síla ve světě – stát, cech, kult, gang, klan, tajná společnost… Záložka 🏴 v postranním
panelu (vedle nití) ukazuje aktivní frakce s postojem k družině (rychle měnitelný v seznamu), vůdcem, nadřazenou frakcí
a počtem otevřených nití; neaktivní/rozpuštěné/zničené jsou sbalené. Filtry podle typu, stavu a postoje.
Typ `group` (👥 Volná skupina / parta) je odlehčená varianta pro neformální partu („Markovi kamarádi“): formulář
nabízí jen název, obrázek, členy, popis a tajemství; vůdce, hierarchie, cíle a vztahy se skrývají a ukládají prázdné.

```yaml
---
id: faction-1700000000000
title: Pražská Camarilla
type: political            # political | military | religious | criminal | commercial | clan | secret | supernatural | group | other
status: active             # active | dormant | disbanded | destroyed | unknown
stance: tense              # postoj k družině: allied | friendly | neutral | tense | hostile | unknown
leader: '[[Kníže Pražský]]'        # existující postava, nebo null
parentFaction: '[[Camarilla]]'     # nadřazená frakce, nebo null (podfrakce se dopočítávají)
goals:                     # obecné záměry organizace (prosté texty, v pořadí)
  - Udržet Maškarádu
characters:                # důležité postavy
  - '[[Marek Novák]]'
relations:                 # vztahy k jiným frakcím – uložené jen u frakce, kde vznikly
  - faction: '[[Anarchové]]'
    stance: hostile
    note: Boj o vliv nad městem.
emblem: portraits/factions/Pražská Camarilla.png
---

Veřejný markdown popis – co frakce je, kde působí, jakou má roli.

<!-- secrets -->

Tajemství: pravda kampaně, kterou družina nemusí znát (do budoucna dostupné jen AI vypravěči).
```

Druhá strana vztahu ho vidí jako „příchozí“ (jen pro čtení, s odkazem na zdrojovou frakci) – jeden vztah = jeden
záznam. Nadřazená frakce nesmí být frakce sama ani vytvořit cyklus (400). Přejmenování/smazání postavy se propíše do
`leader`/`characters`, přejmenování/smazání frakce do `parentFaction`, `relations` ostatních frakcí a `factions` nití.

### Lokace (locations)

Lokace je fyzické místo ve světě – kontinent, region, ostrov, město, čtvrť, budova, dungeon, divočina, památka… Záložka 📍
v postranním panelu bez filtru zobrazuje lokace jako strom (odsazení podle hloubky), s filtrem plochý seznam; hledat lze
podle názvu, filtrovat podle typu a stavu, stav se mění přímo v seznamu. Detail ukazuje breadcrumb od kořene
(`Severní kontinent → Laern → Starý přístav`), nadřazenou lokaci, podřízené lokace (s tlačítkem „Podřízená lokace“) a
dopočítané vazby: scény, questy, nitě, frakce a lore, které na lokaci odkazují. Vazby vlastní druhá strana
(`locations: ['[[Laern]]']` u nitě/questu/frakce, `location: '[[Laern]]'` u scény) – lokace sama drží jen rodiče.

```yaml
---
id: location-1700000000000
title: Laern
type: city                 # continent | region | island | city | town | village | district | building | dungeon | wilderness | landmark | other
status: visited            # unknown (postavy ji ještě neobjevily) | known | visited | abandoned | destroyed
parentLocation: '[[Severní kontinent]]'   # nadřazená lokace, nebo null (podřízené se dopočítávají)
image: portraits/locations/Laern.png
---

Veřejný markdown popis – jak místo vypadá, kdo tam žije.

<!-- secrets -->

Tajemství místa, které postavy nemusí znát.
```

Nadřazená lokace nesmí být lokace sama ani vytvořit cyklus (400). Přejmenování/smazání lokace se propíše do
`parentLocation` ostatních lokací, `locations` nití, questů, frakcí a lore i `location` scén.

### Lore

Lore je encyklopedie světa – historie, legenda, náboženství, kultura, magie, kosmologie, politika, událost, proroctví.
Není to úkol ani hrozba, ale informace. Záložka 📖 hledá v názvu i obsahu, filtruje podle typu, znalosti a pravdivosti;
obě osy se mění přímo v seznamu. Dvě nezávislé osy: `knowledge` (co o tom postavy vědí: unknown | rumored | known)
a `truth` (je to skutečně pravda: unknown | confirmed | partial | debunked) – legenda může být `known` + `debunked`.

```yaml
---
id: lore-1700000000000
title: Velký požár Laernu
type: history              # history | legend | religion | culture | magic | cosmology | politics | event | prophecy | other
truth: confirmed           # unknown | confirmed | partial | debunked (záměrně ne true/false – YAML by četl boolean)
knowledge: rumored         # unknown | rumored | known
characters: []
locations:
  - '[[Laern]]'
factions:
  - '[[Přístavní cech]]'
quests: []
threads:
  - '[[Pohřešovaní lidé]]'
---

Obsah tak, jak je znám ve světě.

<!-- secrets -->

Skutečná pravda – co se opravdu stalo.
```

Vazby vlastní záznam lore; postava, lokace, frakce, quest i nit na svém detailu zobrazí související lore
(dopočítané). Přejmenování/smazání kterékoli z těchto entit se do lore propíše automaticky.

## API (výběr)

```
GET/POST      /api/games
GET/PATCH/DEL /api/games/:game
PUT           /api/games/:game/setup
POST/PUT/DEL  /api/games/:game/characters[/:id]
POST/PUT/DEL  /api/games/:game/narrators[/:id]   ({ name, description?, image? })
GET/POST/PUT/DEL /api/games/:game/threads[/:id]  ({ title, type, status?, horizon?, certainty?, revealCondition?, clock?, characters?, scene?, factions?, description? })
GET/POST/PUT/DEL /api/games/:game/factions[/:id] ({ title, type, status?, stance?, leader?, parentFaction?, goals?, characters?, relations?, emblem?, description?, secrets?, locations? })
GET/POST/PUT/DEL /api/games/:game/locations[/:id] ({ title, type, status?, parentLocation?, image?, description?, secrets? })
GET/POST/PUT/DEL /api/games/:game/lore[/:id]     ({ title, type, truth?, knowledge?, characters?, locations?, factions?, quests?, threads?, content?, secrets? })
GET/POST/PUT/DEL /api/games/:game/sessions[/:id] ({ startedAt, durationSeconds, fun (0–10 po 0,5), description? }) – herní sezení v sessions.md
POST          /api/games/:game/assets            (multipart: kind portrait|narrator|faction|location|background|scene, ownerName?, file)
POST          /api/games/:game/assets/from-url   ({ kind, url, ownerName? })
GET/POST      /api/games/:game/scenes            (POST: { title, description?, image?, characters?, location?, ai?, aiCharacters? })
GET/PUT/PATCH/DEL /api/games/:game/scenes/:scene (PUT = záznamy, PATCH = název/popis/shrnutí/obrázek/postavy/lokace/AI nastavení)
POST          /api/games/:game/scenes/:scene/ai  (AI vypravěč odpoví přes OpenRouter, záznamy se uloží; → { entries, raw })
POST          /api/games/:game/scenes/:scene/summary (AI shrnutí děje scény, nic neukládá; → { summary, raw })
GET           /api/games/:game/events            (SSE – změny souborů hry provedené mimo aplikaci)
POST          /api/games/:game/backup            ({ targetPath } – zip celé složky hry; → { path, bytes })
GET/PUT       /api/vault                         (aktuální složka s hrami; PUT { path, create? } ji přepne)
POST          /api/system/pick-folder            ({ title?, initialPath? } – nativní výběr složky, jen Windows; → { path | null })
POST          /api/system/pick-save-file         ({ title?, fileName, initialDir?, extension? } – nativní „Uložit jako“; → { path | null })
GET           /vault/<Hra>/<cesta>                (statické soubory z aktuální složky s hrami)
```

## Další kroky (plán)

- AI vypravěč: streamování odpovědi, přepínání modelů (`ModelRouter`, mature flag), strukturované návrhy změn nití/questů
- Automatické návrhy dějových nití z AI shrnutí scén; automatika hodin
- Cloudový `StorageProvider` (databáze/S3) a účty uživatelů
