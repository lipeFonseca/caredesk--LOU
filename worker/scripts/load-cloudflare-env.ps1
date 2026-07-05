param(
  [string]$EnvFile = ".dev.vars"
)

$envPath = Join-Path $PSScriptRoot "..\\$EnvFile"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Arquivo de ambiente não encontrado: $envPath"
}

$loaded = @()

Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()

  if (-not $line -or $line.StartsWith('#')) {
    return
  }

  $parts = $line -split '=', 2
  if ($parts.Count -ne 2) {
    return
  }

  $key = $parts[0].Trim()
  $value = $parts[1].Trim()

  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  $loaded += $key
}

Write-Host ("Variaveis carregadas: " + ($loaded -join ', '))
