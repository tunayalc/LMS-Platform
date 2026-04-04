$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.tunnel.local"
if (-not (Test-Path $envFile)) {
  throw "Missing .env.tunnel.local. Run scripts\\set_env_tunnel.ps1 first."
}
$env:LMS_ENV_FILE = $envFile

function Read-EnvFile {
  param([string]$Path)
  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"')
    $map[$key] = $value
  }
  return $map
}

$envMap = Read-EnvFile $envFile
if (-not $envMap["LMS_WEB_PORT"]) {
  throw "LMS_WEB_PORT missing in .env.tunnel.local"
}
$env:PORT = $envMap["LMS_WEB_PORT"]

Set-Location $root
pnpm --filter @lms/web exec next dev -H 0.0.0.0
