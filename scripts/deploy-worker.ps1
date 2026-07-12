$ErrorActionPreference = 'Stop'

$workerDir = Join-Path $PSScriptRoot '..\worker'
$workerUrl = 'https://caredesk-worker.faugusto-thecoral.workers.dev'

Write-Host ''
Write-Host '==> Deploy do Worker' -ForegroundColor Cyan
Write-Host 'Fluxo manual local: este comando publica no Cloudflare, mas nao cria novo run no GitHub Actions.' -ForegroundColor Yellow

Push-Location $workerDir
try {
  . .\scripts\load-cloudflare-env.ps1
  npx wrangler deploy

  $deployedAt = Get-Date
  $summary = [pscustomobject]@{
    target = 'worker'
    url = $workerUrl
    deployed_at = $deployedAt.ToString('yyyy-MM-dd HH:mm:ss zzz')
  }

  Write-Host ''
  Write-Host 'Worker publicado com sucesso.' -ForegroundColor Green
  Write-Host ("URL: {0}" -f $summary.url)
  Write-Host ("Horario: {0}" -f $summary.deployed_at)

  $summary
}
finally {
  Pop-Location
}
