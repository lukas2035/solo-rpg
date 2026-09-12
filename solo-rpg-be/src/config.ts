import path from 'node:path'

export interface Config {
  vaultPath: string
  port: number
}

export function loadConfig(): Config {
  const vaultPath = path.resolve(process.cwd(), process.env.VAULT_PATH ?? '../vault')
  const port = Number(process.env.PORT ?? 3001)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Neplatný PORT: ${process.env.PORT}`)
  }
  return { vaultPath, port }
}
