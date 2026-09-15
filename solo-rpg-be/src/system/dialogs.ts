import { spawn } from 'node:child_process'

/**
 * Nativní dialogy Windows (výběr složky / uložení souboru) spouštěné přes Windows PowerShell a WinForms.
 * BE běží na stejném počítači jako prohlížeč, takže se dialog zobrazí uživateli přímo.
 * Na jiných platformách `isAvailable()` vrací false a FE použije ruční zadání cesty.
 */

const DIALOG_TIMEOUT_MS = 10 * 60 * 1000

let dialogOpen = false

export class DialogBusyError extends Error {
  constructor() {
    super('Jiný dialog je právě otevřený – nejdřív ho zavři.')
  }
}

export function isAvailable(): boolean {
  return process.platform === 'win32'
}

/** Escapování řetězce do jednoduchých uvozovek PowerShellu */
const ps = (value: string) => `'${value.replace(/'/g, "''")}'`

/** Neviditelné okno „nad všemi“, aby dialog vyskočil do popředí a ne za prohlížeč */
const OWNER_FORM = `
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
`

async function runDialog(script: string): Promise<string | null> {
  if (!isAvailable()) throw new Error('Nativní dialogy jsou dostupné jen na Windows.')
  if (dialogOpen) throw new DialogBusyError()
  dialogOpen = true
  try {
    const full = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
${OWNER_FORM}
${script}
`
    const encoded = Buffer.from(full, 'utf16le').toString('base64')
    return await new Promise<string | null>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
      const timer = setTimeout(() => child.kill(), DIALOG_TIMEOUT_MS)
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => {
        clearTimeout(timer)
        if (code !== 0) return reject(new Error(`Dialog selhal (kód ${code}): ${stderr.trim()}`))
        const result = stdout.trim()
        resolve(result ? result : null)
      })
    })
  } finally {
    dialogOpen = false
  }
}

/** Výběr složky; vrací absolutní cestu, nebo null při zrušení. */
export function pickFolder(options: { title?: string; initialPath?: string } = {}): Promise<string | null> {
  const title = options.title ?? 'Vyber složku'
  // OpenFileDialog místo FolderBrowserDialog: moderní vzhled s adresním řádkem. Uživatel vstoupí do složky
  // a potvrdí „Otevřít“ – vrací se rodičovská složka fiktivního souboru.
  return runDialog(`
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title = ${ps(title)}
$dlg.ValidateNames = $false
$dlg.CheckFileExists = $false
$dlg.CheckPathExists = $true
$dlg.FileName = 'Vybrat tuto složku'
$dlg.Filter = 'Složka|*.vybrat-slozku'
${options.initialPath ? `$dlg.InitialDirectory = ${ps(options.initialPath)}` : ''}
if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output (Split-Path -Parent $dlg.FileName)
}
`)
}

/** Dialog „Uložit jako“; vrací absolutní cestu k cílovému souboru, nebo null při zrušení. */
export function pickSaveFile(options: { title?: string; fileName: string; initialDir?: string; extension?: string; filterLabel?: string }): Promise<string | null> {
  const title = options.title ?? 'Uložit jako'
  const extension = options.extension ?? 'zip'
  const filterLabel = options.filterLabel ?? 'ZIP archiv'
  return runDialog(`
$dlg = New-Object System.Windows.Forms.SaveFileDialog
$dlg.Title = ${ps(title)}
$dlg.FileName = ${ps(options.fileName)}
$dlg.DefaultExt = ${ps(extension)}
$dlg.AddExtension = $true
$dlg.OverwritePrompt = $true
$dlg.Filter = ${ps(`${filterLabel} (*.${extension})|*.${extension}|Všechny soubory (*.*)|*.*`)}
${options.initialDir ? `$dlg.InitialDirectory = ${ps(options.initialDir)}` : ''}
if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dlg.FileName
}
`)
}
