# Záloha všech dat aplikace: dump Postgresu + zip obrázků → dva soubory ve složce zálohy.
#   npm run backup                      → .\backups\<datum>\
#   npm run backup -- -Target D:\OneDrive\SoloRPG\backups
param(
    [string]$Target = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$dir = Join-Path $Target $stamp
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host "Dump databáze…"
$dump = Join-Path $dir 'solo_rpg.dump'
# pg_dump běží v kontejneru, výstup v binárním (custom) formátu se jen zkopíruje ven
docker compose -f (Join-Path $root 'docker-compose.yml') exec -T db pg_dump -U solo -d solo_rpg -Fc -f /tmp/solo_rpg.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_dump selhal – běží databáze (npm run db:up)?' }
docker compose -f (Join-Path $root 'docker-compose.yml') cp db:/tmp/solo_rpg.dump $dump
if ($LASTEXITCODE -ne 0) { throw 'Kopírování dumpu z kontejneru selhalo.' }

$assets = Join-Path $root 'data\assets'
if (Test-Path $assets) {
    Write-Host "Zip obrázků…"
    Compress-Archive -Path (Join-Path $assets '*') -DestinationPath (Join-Path $dir 'assets.zip') -CompressionLevel Optimal
}

Write-Host "Hotovo: $dir"
Get-ChildItem $dir | Format-Table Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } }
