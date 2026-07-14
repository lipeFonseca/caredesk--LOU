$ErrorActionPreference = 'Stop'

$workerDir = Join-Path $PSScriptRoot '..\worker'
$frontendDir = Join-Path $PSScriptRoot '..\frontend'
$pagesProjectName = 'caredesk-lou'
$pagesUrl = 'https://caredesk-lou.pages.dev'

Write-Host ''
Write-Host '==> Deploy do Frontend' -ForegroundColor Cyan
Write-Host 'Fluxo manual local: este comando publica no Cloudflare Pages, mas nao cria novo run no GitHub Actions.' -ForegroundColor Yellow

Push-Location $frontendDir
try {
  if (-not $env:VITE_API_BASE) {
    $env:VITE_API_BASE = 'https://caredesk-worker.faugusto-thecoral.workers.dev'
  }

  npm run build

  Push-Location $workerDir
  try {
    . .\scripts\load-cloudflare-env.ps1
  }
  finally {
    Pop-Location
  }

  npx wrangler@4 pages deploy dist --project-name $pagesProjectName

  $deploymentUrl = $null
  $deployedAt = Get-Date

  if ($env:CLOUDFLARE_API_TOKEN -and $env:CLOUDFLARE_ACCOUNT_ID) {
    try {
      $headers = @{ Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)" }
      $project = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$($env:CLOUDFLARE_ACCOUNT_ID)/pages/projects/$pagesProjectName" -Headers $headers
      $deploymentUrl = $project.result.latest_deployment.url
      if ($project.result.latest_deployment.modified_on) {
        $deployedAt = [datetimeoffset]::Parse($project.result.latest_deployment.modified_on).LocalDateTime
      }
    } catch {
      # Mantem o resumo mesmo se a consulta extra falhar
    }
  }

  $summary = [pscustomobject]@{
    target = 'frontend'
    url = $pagesUrl
    deployment_url = $deploymentUrl
    deployed_at = $deployedAt.ToString('yyyy-MM-dd HH:mm:ss zzz')
  }

  Write-Host ''
  Write-Host 'Frontend publicado com sucesso.' -ForegroundColor Green
  Write-Host ("Dominio principal: {0}" -f $summary.url)
  if ($summary.deployment_url) {
    Write-Host ("Deployment URL: {0}" -f $summary.deployment_url)
  }
  Write-Host ("Horario: {0}" -f $summary.deployed_at)

  $summary
}
finally {
  Pop-Location
}
