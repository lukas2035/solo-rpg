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
    ├── portraits/           # portréty postav podle celého jména (_dm.* = vypravěč)
    ├── backgrounds/         # pozadí hry + obrázky scén (podle názvu scény)
    └── scenes/001 - Název.md  # scény = popis + záznamy příběhu
```

Formát scény (frontmatter `title`, `image`, tělo = markdown popis, značka `<!-- entries -->`, záznamy):

```markdown
Popis scény v markdownu (upravuje se v dialogu scény i v Obsidianu).

<!-- entries -->

<!-- entry id="1700000000000" ts="1700000000000" -->
**[[Aria Stormwind|Aria]]**: Jednořádková replika postavy.

<!-- entry id="1700000000001" ts="1700000000001" -->
**DM**:
Víceřádkový markdown vypravěče.
```

Postavy jsou wikilinky na soubory v `characters/` (celé jméno) s aliasem = nickname. Můžeš dopisovat záznamy
i ručně v Obsidianu (`**[[Celé jméno]]**: text` nebo `**Nickname**: text`) – aplikace je načte tlačítkem 💬.
Soubor scény bez značky `<!-- entries -->` se čte celý jako záznamy (starý formát).
Aplikace při zápisu zachovává vlastní frontmatter klíče a tělo poznámek u postav i hry.
Přejmenování postavy v aplikaci přejmenuje soubor, portrét i odkazy ve scénách; přejmenování scény
přejmenuje její soubor i obrázek.

## API (výběr)

```
GET/POST      /api/games
GET/PATCH/DEL /api/games/:game
PUT           /api/games/:game/setup
POST/PUT/DEL  /api/games/:game/characters[/:id]
POST          /api/games/:game/assets            (multipart: kind, ownerName?, file)
POST          /api/games/:game/assets/from-url   ({ kind, url, ownerName? })
GET/POST      /api/games/:game/scenes            (POST: { title, description?, image? })
GET/PUT/PATCH/DEL /api/games/:game/scenes/:scene (PUT = záznamy, PATCH = název/popis/obrázek)
GET           /vault/<Hra>/<cesta>                (statické soubory z vaultu)
```

## Další kroky (plán)

- Generování textů přes OpenRouter (`POST /api/generate`, přepínání modelů na BE)
- Lokace a questy jako další typy poznámek ve vaultu
- Cloudový `StorageProvider` (databáze/S3) a účty uživatelů
