$ErrorActionPreference = 'Stop'

param(
  [string]$CommitMessage
)

$repoRoot = Join-Path $PSScriptRoot '..'
$blockedPathPatterns = @(
  'worker/.dev.vars',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'frontend/.env.local',
  'frontend/.env.production',
  'frontend/.env.development',
  '*.pem',
  '*.key',
  '*.p12',
  '*.crt'
)

function Test-BlockedPath {
  param(
    [string]$Path
  )

  foreach ($pattern in $blockedPathPatterns) {
    if ($Path -like $pattern -or $Path -like "*$pattern") {
      return $true
    }
  }

  return $false
}

function Invoke-GitPublish {
  param(
    [string]$Message
  )

  Push-Location $repoRoot
  try {
    $statusLines = @(git status --short)
    if ($statusLines.Count -eq 0) {
      Write-Host ''
      Write-Host '==> Git' -ForegroundColor Cyan
      Write-Host 'Nenhuma mudanca local para commitar. Seguindo para o deploy.' -ForegroundColor Yellow
      return
    }

    $trackedPaths = @()
    foreach ($line in $statusLines) {
      if ($line.Length -lt 4) { continue }
      $path = $line.Substring(3).Trim()
      if ($path) {
        $trackedPaths += $path
      }
    }

    $blockedPaths = @($trackedPaths | Where-Object { Test-BlockedPath $_ } | Select-Object -Unique)
    if ($blockedPaths.Count -gt 0) {
      Write-Host ''
      Write-Host '==> Git' -ForegroundColor Cyan
      Write-Host 'Arquivos sensiveis detectados entre as mudancas locais. Commit bloqueado.' -ForegroundColor Red
      $blockedPaths | ForEach-Object { Write-Host (" - {0}" -f $_) -ForegroundColor Red }
      throw 'Remova ou ignore os arquivos sensiveis antes de continuar.'
    }

    Write-Host ''
    Write-Host '==> Git' -ForegroundColor Cyan
    Write-Host 'Arquivos que entrarao no commit:' -ForegroundColor Yellow
    $trackedPaths | ForEach-Object { Write-Host (" - {0}" -f $_) }

    if (-not $Message) {
      $Message = Read-Host 'Titulo do commit'
    }

    if (-not $Message -or [string]::IsNullOrWhiteSpace($Message)) {
      throw 'Titulo do commit vazio. Operacao cancelada.'
    }

    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    $confirm = Read-Host "Confirmar commit, push e deploy da branch '$branch'? (s/N)"
    if ($confirm -notin @('s', 'S', 'y', 'Y')) {
      throw 'Operacao cancelada antes do commit.'
    }

    git add -A
    git commit -m $Message
    git push origin $branch

    Write-Host ''
    Write-Host 'Commit e push concluidos com sucesso.' -ForegroundColor Green
    Write-Host ("Branch:  {0}" -f $branch)
    Write-Host ("Commit:  {0}" -f $Message)
  }
  finally {
    Pop-Location
  }
}

Invoke-GitPublish -Message $CommitMessage

$workerSummary = & (Join-Path $PSScriptRoot 'deploy-worker.ps1')
$frontendSummary = & (Join-Path $PSScriptRoot 'deploy-frontend.ps1')

Write-Host ''
Write-Host '==> Resumo final' -ForegroundColor Cyan
Write-Host ("Worker:   {0}" -f $workerSummary.url) -ForegroundColor Green
Write-Host ("Horario:  {0}" -f $workerSummary.deployed_at)
Write-Host ("Frontend: {0}" -f $frontendSummary.url) -ForegroundColor Green
if ($frontendSummary.deployment_url) {
  Write-Host ("Preview:  {0}" -f $frontendSummary.deployment_url)
}
Write-Host ("Horario:  {0}" -f $frontendSummary.deployed_at)
