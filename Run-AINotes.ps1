<#
.SYNOPSIS
  Запуск микросервисов AI Notes — каждый в своём окне-терминале (по аналогии с ReefReview Run.ps1).

.DESCRIPTION
  Открывает отдельное окно PowerShell на каждый выбранный сервис (видно логи, можно Ctrl+C).
  Инфраструктуру (Postgres + Redis) поднимает в Docker. С флагом -Debug сервисы стартуют
  с открытым инспектором Node (порты 9229..9232) — можно подцепиться отладчиком.

.PARAMETER All       Всё: инфра + auth + notes + worker + gateway.
.PARAMETER Infra     Поднять Postgres + Redis (docker compose).
.PARAMETER Auth      Открыть терминал auth (TCP :3001).
.PARAMETER Notes     Открыть терминал notes (TCP :3002).
.PARAMETER Worker    Открыть терминал worker.
.PARAMETER Gateway   Открыть терминал gateway (HTTP :3000).
.PARAMETER Web       Открыть терминал фронта Angular (:4200).
.PARAMETER Inspect   Запускать сервисы в debug-режиме (инспектор Node).
.PARAMETER Stop      Остановить инфраструктуру (docker compose stop postgres redis).

.EXAMPLE
  ./Run-AINotes.ps1 -All
.EXAMPLE
  ./Run-AINotes.ps1 -Infra -Gateway -Auth -Notes -Worker -Inspect
.EXAMPLE
  ./Run-AINotes.ps1 -Stop
#>
[CmdletBinding()]
param(
  [switch] $All,
  [switch] $Infra,
  [switch] $Auth,
  [switch] $Notes,
  [switch] $Worker,
  [switch] $Gateway,
  [switch] $Web,
  [switch] $Inspect,
  [switch] $Stop
)

$ErrorActionPreference = 'Stop'
$root   = $PSScriptRoot
$apiDir = Join-Path $root 'api'
$webDir = Join-Path $root 'web'

# pwsh, если есть; иначе Windows PowerShell.
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

# Открывает новое окно-терминал с заголовком и командой (аналог Invoke-InTerminalWindow из ReefReview).
function Start-ServiceWindow([string] $title, [string] $workDir, [string] $command) {
  $inner = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$workDir'; $command"
  Start-Process $shell -ArgumentList '-NoExit', '-NoProfile', '-Command', $inner
  Write-Host "  ▶ окно: $title" -ForegroundColor Cyan
}

if ($Stop) {
  Write-Host 'Остановка инфраструктуры...' -ForegroundColor Yellow
  docker compose -f (Join-Path $root 'docker-compose.yml') stop postgres redis
  Write-Host 'Готово. Окна сервисов закрой вручную (Ctrl+C в каждом).' -ForegroundColor Yellow
  return
}

if ($All) { $Infra = $Auth = $Notes = $Worker = $Gateway = $true }

if (-not ($Infra -or $Auth -or $Notes -or $Worker -or $Gateway -or $Web)) {
  Write-Host 'Ничего не выбрано. Примеры: ' -ForegroundColor Yellow
  Write-Host '  ./Run-AINotes.ps1 -All'
  Write-Host '  ./Run-AINotes.ps1 -Infra -Gateway -Auth -Notes -Worker'
  Write-Host '  ./Run-AINotes.ps1 -All -Inspect    # с отладкой'
  Write-Host '  ./Run-AINotes.ps1 -Stop'
  return
}

# Префикс npm-скрипта: start (обычный) или debug (с инспектором).
$mode = if ($Inspect) { 'debug' } else { 'start' }

if ($Infra) {
  Write-Host 'Поднимаю Postgres + Redis...' -ForegroundColor Green
  docker compose -f (Join-Path $root 'docker-compose.yml') up -d postgres redis
  # подождать готовности БД
  for ($i = 0; $i -lt 30; $i++) {
    docker exec ainotes-pg-compose pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  Write-Host '  Postgres готов.' -ForegroundColor Green
}

# Порядок: auth и notes раньше gateway (gateway к ним подключается по TCP).
if ($Auth)    { Start-ServiceWindow 'AINotes auth'    $apiDir "npm run ${mode}:auth" }
if ($Notes)   { Start-ServiceWindow 'AINotes notes'   $apiDir "npm run ${mode}:notes" }
if ($Worker)  { Start-ServiceWindow 'AINotes worker'  $apiDir "npm run ${mode}:worker" }
if ($Gateway) { Start-ServiceWindow 'AINotes gateway' $apiDir "npm run ${mode}:gateway" }
if ($Web)     { Start-ServiceWindow 'AINotes web'     $webDir 'npm start' }

Write-Host ''
Write-Host 'Сервисы запускаются в отдельных окнах. Проверка: curl http://localhost:3000/health' -ForegroundColor Green
if ($Inspect) {
  Write-Host 'Debug-порты: gateway 9229, auth 9230, notes 9231, worker 9232 — цепляйся отладчиком.' -ForegroundColor Green
}
