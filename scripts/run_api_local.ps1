$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) {
  throw "Missing .env.local. Run scripts\\detect_env.ps1 first."
}
$env:LMS_ENV_FILE = $envFile

Set-Location $root
pnpm --filter @lms/api dev
