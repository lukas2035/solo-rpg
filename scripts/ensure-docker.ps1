# Zajistí, že běží Docker Desktop (Docker engine). Pokud ne, spustí ho a počká na připravenost.
$ErrorActionPreference = 'Stop'

function Test-DockerReady {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    & cmd /c "docker info >nul 2>&1"
    $ok = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $prev
    return $ok
}

if (Test-DockerReady) {
    Write-Host "Docker běží."
    exit 0
}

$candidates = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
)
# Odvození z umístění docker.exe v PATH (…\resources\bin\docker.exe -> …\Docker Desktop.exe)
$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCli) {
    $root = Split-Path (Split-Path (Split-Path $dockerCli.Source -Parent) -Parent) -Parent
    $candidates += Join-Path $root 'Docker Desktop.exe'
}
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
    Write-Error "Docker neběží a Docker Desktop.exe nebyl nalezen. Spusť ho ručně."
    exit 1
}

Write-Host "Docker neběží, spouštím Docker Desktop..."
Start-Process -FilePath $exe

$timeoutSec = 120
$elapsed = 0
while (-not (Test-DockerReady)) {
    if ($elapsed -ge $timeoutSec) {
        Write-Error "Docker se nespustil do $timeoutSec s."
        exit 1
    }
    Start-Sleep -Seconds 3
    $elapsed += 3
    Write-Host "  čekám na Docker... ($elapsed s)"
}

Write-Host "Docker je připraven."
exit 0
