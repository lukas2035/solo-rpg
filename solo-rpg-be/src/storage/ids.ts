import { customAlphabet } from 'nanoid'

/** Bez snadno zaměnitelných znaků (0/O, 1/l/I) – ID se objevují v promptech a lozích */
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz'
const nano = customAlphabet(alphabet, 12)

export type EntityKind = 'character' | 'narrator' | 'scene' | 'thread' | 'faction' | 'quest' | 'location' | 'lore' | 'session'

export const ENTITY_KINDS: readonly EntityKind[] = ['character', 'narrator', 'scene', 'thread', 'faction', 'quest', 'location', 'lore', 'session']

const PREFIX: Record<EntityKind | 'game' | 'asset', string> = {
  character: 'chr',
  narrator: 'nar',
  scene: 'scn',
  thread: 'thr',
  faction: 'fac',
  quest: 'qst',
  location: 'loc',
  lore: 'lor',
  session: 'ses',
  game: 'gam',
  asset: 'ast',
}

/** Čitelný prefix + nanoid, např. `chr_v7k2mq9xw3tz` */
export function newId(kind: keyof typeof PREFIX): string {
  return `${PREFIX[kind]}_${nano()}`
}
