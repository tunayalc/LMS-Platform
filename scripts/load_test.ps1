param(
  [ValidateSet("local", "docker")]
  [string]$Mode = "local",
  [int]$Requests = 50
)

function Read-EnvFile {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
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

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = if ($Mode -eq "local") { Join-Path $root ".env.local" } else { Join-Path $root ".env.docker" }
if (-not (Test-Path $envFile)) {
  throw "Missing $envFile. Run scripts\\detect_env.ps1 first."
}

$envMap = Read-EnvFile $envFile
$apiKey = if ($Mode -eq "local") { "LMS_API_BASE_URL_LOCAL" } else { "LMS_API_BASE_URL_DOCKER" }
$apiBase = $envMap[$apiKey]
if (-not $apiBase) {
  throw "Missing $apiKey in $envFile"
}

Write-Host "Load test $Mode -> $apiBase (requests=$Requests)"

$durations = @()
for ($i = 1; $i -le $Requests; $i++) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    Invoke-RestMethod -Uri "$apiBase/health" -Method Get -TimeoutSec 5 | Out-Null
  } catch {
    Write-Host "Request $i failed."
    throw
  } finally {
    $sw.Stop()
  }
  $durations += $sw.ElapsedMilliseconds
}

$avg = [Math]::Round(($durations | Measure-Object -Average).Average, 2)
$max = ($durations | Measure-Object -Maximum).Maximum
$min = ($durations | Measure-Object -Minimum).Minimum

Write-Host "Load test results: avg=${avg}ms min=${min}ms max=${max}ms"
