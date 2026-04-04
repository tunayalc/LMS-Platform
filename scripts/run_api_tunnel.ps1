$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.tunnel.local"
if (-not (Test-Path $envFile)) {
  throw "Missing .env.tunnel.local. Run scripts\\set_env_tunnel.ps1 first."
}
$env:LMS_ENV_FILE = $envFile

Set-Location $root
pnpm --filter @lms/api dev
