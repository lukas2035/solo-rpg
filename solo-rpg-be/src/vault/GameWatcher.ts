import { watch, existsSync, type FSWatcher } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

export type ChangeListener = (paths: string[]) => void

/** Otisk obsahu souboru – změna přístupového času ho nemění */
interface Fingerprint {
  mtimeMs: number
  size: number
}

interface WatchedGame {
  watcher: FSWatcher
  listeners: Set<ChangeListener>
  pending: Set<string>
  timer: NodeJS.Timeout | null
  /** Otisky všech sledovaných souborů (relativní cesta s `/`) */
  files: Map<string, Fingerprint>
  /** Dokončení úvodního snímku složky – události se zpracují až po něm */
  ready: Promise<void>
}

/** Jak dlouho po vlastním zápisu BE ignorovat události ze sledované složky */
const OWN_CHANGE_QUIET_MS = 1500
/** Sdružení rychle po sobě jdoucích událostí do jedné zprávy */
const DEBOUNCE_MS = 400

/**
 * Sleduje složku otevřené hry ve vaultu a hlásí změny provedené zvenčí (např. v Obsidianu).
 *
 * `fs.watch` s `recursive` používá na Windows jeden systémový handle na celý strom (ReadDirectoryChangesW),
 * takže počet souborů ve hře nehraje roli. Sleduje se jen hra, ke které je někdo připojený.
 *
 * Windows hlásí i změnu času posledního přístupu (např. když se prohlížeči odešle obrázek pozadí),
 * proto se každá událost ověří proti otisku souboru (mtime + velikost) a ohlásí se jen skutečný zápis,
 * vytvoření nebo smazání.
 */
export class GameWatcher {
  private readonly games = new Map<string, WatchedGame>()
  private readonly quietUntil = new Map<string, number>()

  constructor(private readonly vaultPath: string) {}

  /** Označí, že BE právě sám zapisuje do hry – události z následujícího okna se neohlásí. */
  noteOwnChange(game: string): void {
    this.quietUntil.set(game, Date.now() + OWN_CHANGE_QUIET_MS)
  }

  private isQuiet(game: string): boolean {
    return (this.quietUntil.get(game) ?? 0) > Date.now()
  }

  /** Přihlásí posluchače změn; vrací funkci pro odhlášení. Vrací null, pokud hra neexistuje. */
  subscribe(game: string, listener: ChangeListener): (() => void) | null {
    let entry = this.games.get(game)
    if (!entry) {
      const started = this.start(game)
      if (!started) return null
      entry = started
      this.games.set(game, entry)
    }
    entry.listeners.add(listener)
    return () => {
      const current = this.games.get(game)
      if (!current) return
      current.listeners.delete(listener)
      if (current.listeners.size === 0) this.stop(game)
    }
  }

  private start(game: string): WatchedGame | null {
    const dir = path.join(this.vaultPath, game)
    if (!existsSync(dir)) return null
    const files = new Map<string, Fingerprint>()
    const entry: WatchedGame = {
      watcher: null as unknown as FSWatcher,
      listeners: new Set(),
      pending: new Set(),
      timer: null,
      files,
      ready: this.snapshot(dir, '', files).catch(() => undefined),
    }
    try {
      entry.watcher = watch(dir, { recursive: true, persistent: false }, (_event, filename) => {
        if (!filename) return
        const rel = filename.toString().replace(/\\/g, '/')
        if (this.shouldIgnore(rel)) return
        void this.handleEvent(game, entry, dir, rel)
      })
    } catch {
      return null
    }
    // Složka hry smazána/přejmenována → sledování ukončit, klienti se případně připojí znovu
    entry.watcher.on('error', () => this.stop(game))
    return entry
  }

  /** Úvodní snímek otisků všech souborů ve složce hry */
  private async snapshot(root: string, rel: string, files: Map<string, Fingerprint>): Promise<void> {
    const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true })
    await Promise.all(entries.map(async dirent => {
      const childRel = rel ? `${rel}/${dirent.name}` : dirent.name
      if (this.shouldIgnore(childRel)) return
      if (dirent.isDirectory()) return this.snapshot(root, childRel, files)
      if (!dirent.isFile()) return
      try {
        const st = await fs.stat(path.join(root, childRel))
        files.set(childRel, { mtimeMs: st.mtimeMs, size: st.size })
      } catch {
        // soubor mezitím zmizel
      }
    }))
  }

  private async handleEvent(game: string, entry: WatchedGame, dir: string, rel: string): Promise<void> {
    await entry.ready
    if (this.games.get(game) !== entry) return
    // Otisk se aktualizuje vždy (i při vlastním zápisu BE), aby pozdější přístup nevypadal jako změna
    if (!(await this.refresh(dir, rel, entry.files))) return
    if (this.isQuiet(game)) return
    entry.pending.add(rel)
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => this.flush(game, entry), DEBOUNCE_MS)
  }

  /** Aktualizuje otisk souboru; vrací true, jen když se obsah skutečně změnil (zápis, vytvoření, smazání). */
  private async refresh(dir: string, rel: string, files: Map<string, Fingerprint>): Promise<boolean> {
    let st
    try {
      st = await fs.stat(path.join(dir, rel))
    } catch {
      return files.delete(rel)
    }
    // Změny adresářů se projeví událostmi jejich souborů
    if (st.isDirectory()) return false
    const prev = files.get(rel)
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return false
    files.set(rel, { mtimeMs: st.mtimeMs, size: st.size })
    return true
  }

  private flush(game: string, entry: WatchedGame): void {
    entry.timer = null
    if (entry.pending.size === 0) return
    // Vlastní zápis mohl přijít až po zařazení do fronty
    if (this.isQuiet(game)) {
      entry.pending.clear()
      return
    }
    const paths = [...entry.pending].sort()
    entry.pending.clear()
    for (const listener of entry.listeners) listener(paths)
  }

  private stop(game: string): void {
    const entry = this.games.get(game)
    if (!entry) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.watcher.close()
    this.games.delete(game)
  }

  /** Dočasné soubory atomického zápisu, skryté soubory a konfigurace Obsidianu */
  private shouldIgnore(rel: string): boolean {
    if (rel.endsWith('.tmp')) return true
    return rel.split('/').some(part => part.startsWith('.'))
  }

  closeAll(): void {
    for (const game of [...this.games.keys()]) this.stop(game)
  }
}
