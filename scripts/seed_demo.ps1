$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Host "Missing .env.local. Running detect_env.ps1..."
  & (Join-Path $root "scripts\\detect_env.ps1")
}

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

$envMap = Read-EnvFile -Path $envFile
$apiBase = $envMap["LMS_API_BASE_URL_LOCAL"]
if (-not $apiBase) {
  throw "Missing LMS_API_BASE_URL_LOCAL in .env.local"
}

Write-Host "Waiting for API at $apiBase..."
$ready = $false
foreach ($i in 1..20) {
  try {
    Invoke-RestMethod -Uri "$apiBase/health" -Method Get -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $ready) {
  throw "API not reachable. Start API first (pnpm dev:api or pnpm dev:fast)."
}

Write-Host "Seeding demo data..."
& (Join-Path $root "scripts\\demo_courses.ps1")
& (Join-Path $root "scripts\\demo_questions.ps1")

Write-Host "Demo data seeded."
