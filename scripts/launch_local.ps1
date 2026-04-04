param(
  [switch]$WithMobile,
  [switch]$WithOmr,
  [switch]$Seed
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

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

Write-Host "Generating env..."
& (Join-Path $root "scripts\\detect_env.ps1")

Write-Host "Starting API..."
Start-Process powershell -ArgumentList @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $root "scripts\\run_api_local.ps1")
)

Write-Host "Starting Web..."
Start-Process powershell -ArgumentList @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $root "scripts\\run_web_local.ps1")
)

if ($WithMobile) {
  Write-Host "Starting Mobile (Expo Go)..."
  Start-Process powershell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $root "scripts\\run_mobile_local.ps1"),
    "-Clear"
  )
}

if ($WithOmr) {
  Write-Host "Starting OMR..."
  Start-Process powershell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $root "scripts\\run_omr_local.ps1")
  )
}

if ($Seed) {
  $envFile = Join-Path $root ".env.local"
  $envMap = Read-EnvFile -Path $envFile
  $apiBase = $envMap["LMS_API_BASE_URL_LOCAL"]
  if ($apiBase) {
    Write-Host "Waiting for API..."
    $ready = $false
    foreach ($i in 1..30) {
      try {
        Invoke-RestMethod -Uri "$apiBase/health" -Method Get -TimeoutSec 2 | Out-Null
        $ready = $true
        break
      } catch {
        Start-Sleep -Seconds 1
      }
    }
    if ($ready) {
      Write-Host "Seeding demo data..."
      & (Join-Path $root "scripts\\seed_demo.ps1")
    } else {
      Write-Host "API not ready; skipping seed."
    }
  }
}

Write-Host "Done."
