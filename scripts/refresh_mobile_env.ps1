$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$mobileEnvFile = Join-Path $root "apps\\mobile\\.env.local"
$fallbackEnvFile = Join-Path $root ".env.local"
$envFile = if (Test-Path $mobileEnvFile) { $mobileEnvFile } else { $fallbackEnvFile }
if (-not (Test-Path $envFile)) {
  throw "Missing env file. Run scripts\\detect_env.ps1 first."
}

$env:LMS_ENV_FILE = $envFile

Set-Location $root
pnpm --filter @lms/mobile exec expo config --type public | Out-Null
Write-Host "Expo mobile env refreshed from $envFile"
