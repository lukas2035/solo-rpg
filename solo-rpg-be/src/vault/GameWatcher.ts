import { watch, existsSync, type FSWatcher } from 'node:fs'
import path from 'node:path'

export type ChangeListener = (paths: string[]) => void

interface WatchedGame {
  watcher: FSWatcher
  listeners: Set<ChangeListener>
  pending: Set<string>
  timer: NodeJS.Timeout | null
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
 */
export class GameWatcher {
  private readonly games = new Map<string, WatchedGame>()
  private readonly quietUntil = new Map<string, number>()

  constructor(private readonly vaultPath: string) {}

  /** Označí, že BE právě sám zapisuje do hry – události z následujícího okna se neohlásí. */
  noteOwnChange(game: string): void {
    this.quietUntil.set(game, Date.now() + OWN_CHANGE_QUIET_MS)
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
    const entry: WatchedGame = { watcher: null as unknown as FSWatcher, listeners: new Set(), pending: new Set(), timer: null }
    try {
      entry.watcher = watch(dir, { recursive: true, persistent: false }, (_event, filename) => {
        if (!filename) return
        const rel = filename.toString().replace(/\\/g, '/')
        if (this.shouldIgnore(rel)) return
        if ((this.quietUntil.get(game) ?? 0) > Date.now()) return
        entry.pending.add(rel)
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = setTimeout(() => this.flush(game, entry), DEBOUNCE_MS)
      })
    } catch {
      return null
    }
    // Složka hry smazána/přejmenována → sledování ukončit, klienti se případně připojí znovu
    entry.watcher.on('error', () => this.stop(game))
    return entry
  }

  private flush(game: string, entry: WatchedGame): void {
    entry.timer = null
    if (entry.pending.size === 0) return
    // Vlastní zápis mohl přijít až po zařazení do fronty
    if ((this.quietUntil.get(game) ?? 0) > Date.now()) {
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
