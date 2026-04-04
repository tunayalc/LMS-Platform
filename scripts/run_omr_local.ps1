param()

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.local"

if (-not (Test-Path $envFile)) {
  throw "Missing .env.local. Run pnpm env:detect first."
}

function Get-EnvMap {
  param([string]$Path)
  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $map[$parts[0]] = $parts[1]
    }
  }
  return $map
}

$envMap = Get-EnvMap -Path $envFile
$omrBase = $envMap["LMS_OMR_BASE_URL_LOCAL"]
if (-not $omrBase) {
  throw "LMS_OMR_BASE_URL_LOCAL is required in .env.local."
}

$uri = [Uri]$omrBase
$omrHost = $uri.Host
$omrPort = $uri.Port

$env:LMS_ENV_FILE = ".env.local"

$venvPython = Join-Path $root "services\\omr-python\\.venv\\Scripts\\python.exe"
if (-not (Test-Path $venvPython)) {
  throw "Missing OMR venv. Create with: python -m venv services\\omr-python\\.venv"
}

$serviceRoot = Join-Path $root "services\\omr-python"
Push-Location $serviceRoot
try {
  & $venvPython -m uvicorn app.main:app --host $omrHost --port $omrPort
} finally {
  Pop-Location
}
