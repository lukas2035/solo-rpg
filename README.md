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
VAULT_PATH=../vault   # kořen Obsidian vaultu – otevři ho v Obsidianu jako vault
PORT=3001
```

Další příkazy: `npm run build` (typecheck + build všech workspaces), `npm run lint` (oxlint FE).

## Struktura vaultu

```
vault/
└── <Název hry>/
    ├── game.md              # nastavení hry (frontmatter) + volné poznámky
    ├── characters/<Celé jméno>.md  # jedna postava (PC i NPC) = jeden soubor (frontmatter + markdown poznámky)
    ├── narrators/<Jméno>.md  # vypravěči (narrator) – jméno + markdown popis; aktuální vypravěč je v game.md (`narrator: [[Jméno]]`)
    ├── threads/<Název>.md   # dějové nitě (threads) – otevřené komplikace, hrozby, záhady… (frontmatter + markdown popis)
    ├── factions/<Název>.md  # frakce – organizace ve světě (frontmatter + markdown popis, tajemství za `<!-- secrets -->`)
    ├── portraits/           # portréty postav podle celého jména; portraits/narrators/ = vypravěči, portraits/factions/ = emblémy frakcí
    ├── backgrounds/         # pozadí hry + obrázky scén (podle názvu scény)
    └── scenes/001 - Název.md  # scény = popis + záznamy příběhu
```

Formát scény (frontmatter `title`, `image`, `characters` = wikilinky postav přítomných ve scéně; tělo = markdown popis, značka `<!-- entries -->`, záznamy):

```markdown
Popis scény v markdownu (upravuje se v dialogu scény i v Obsidianu).

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

```yaml
---
id: faction-1700000000000
title: Pražská Camarilla
type: political            # political | military | religious | criminal | commercial | clan | secret | supernatural | other
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

## API (výběr)

```
GET/POST      /api/games
GET/PATCH/DEL /api/games/:game
PUT           /api/games/:game/setup
POST/PUT/DEL  /api/games/:game/characters[/:id]
POST/PUT/DEL  /api/games/:game/narrators[/:id]   ({ name, description?, image? })
GET/POST/PUT/DEL /api/games/:game/threads[/:id]  ({ title, type, status?, horizon?, certainty?, revealCondition?, clock?, characters?, scene?, factions?, description? })
GET/POST/PUT/DEL /api/games/:game/factions[/:id] ({ title, type, status?, stance?, leader?, parentFaction?, goals?, characters?, relations?, emblem?, description?, secrets? })
POST          /api/games/:game/assets            (multipart: kind portrait|narrator|faction|background|scene, ownerName?, file)
POST          /api/games/:game/assets/from-url   ({ kind, url, ownerName? })
GET/POST      /api/games/:game/scenes            (POST: { title, description?, image?, characters? })
GET/PUT/PATCH/DEL /api/games/:game/scenes/:scene (PUT = záznamy, PATCH = název/popis/obrázek/postavy)
GET           /api/games/:game/events            (SSE – změny souborů hry provedené mimo aplikaci)
GET           /vault/<Hra>/<cesta>                (statické soubory z vaultu)
```

## Další kroky (plán)

- Generování textů přes OpenRouter (`POST /api/generate`, přepínání modelů na BE) – vypravěč napojený na AI řídí hru
- Automatické návrhy dějových nití z AI shrnutí scén; automatika hodin
- Lokace a questy jako další typy poznámek ve vaultu (a jejich vazby na nitě a frakce – sídlo, území)
- Cloudový `StorageProvider` (databáze/S3) a účty uživatelů
