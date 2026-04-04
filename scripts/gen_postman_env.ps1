param(
  [ValidateSet("local", "docker")]
  [string]$Mode = "local",
  [string]$OutPath
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = if ($Mode -eq "local") { Join-Path $root ".env.local" } else { Join-Path $root ".env.docker" }

if (-not (Test-Path $envFile)) {
  throw "Missing $envFile. Run scripts\\detect_env.ps1 first."
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

function Require-Env {
  param([hashtable]$Map, [string]$Key)
  if (-not $Map.ContainsKey($Key) -or -not $Map[$Key]) {
    throw "Missing $Key in $envFile"
  }
  return $Map[$Key]
}

$envMap = Read-EnvFile $envFile
$apiKey = if ($Mode -eq "local") { "LMS_API_BASE_URL_LOCAL" } else { "LMS_API_BASE_URL_DOCKER" }
$omrKey = if ($Mode -eq "local") { "LMS_OMR_BASE_URL_LOCAL" } else { "LMS_OMR_BASE_URL_DOCKER" }

$apiBase = Require-Env -Map $envMap -Key $apiKey
$omrBase = Require-Env -Map $envMap -Key $omrKey

if (-not $OutPath) {
  $fileName = "postman_environment_$Mode.json"
  $OutPath = Join-Path $root $fileName
}

$content = @{
  name = "LMS $($Mode.Substring(0,1).ToUpper() + $Mode.Substring(1))"
  values = @(
    @{ key = "apiBaseUrl"; value = $apiBase; enabled = $true },
    @{ key = "omrBaseUrl"; value = $omrBase; enabled = $true },
    @{ key = "token"; value = ""; enabled = $true },
    @{ key = "courseId"; value = ""; enabled = $true },
    @{ key = "examId"; value = ""; enabled = $true },
    @{ key = "contentId"; value = ""; enabled = $true },
    @{ key = "userId"; value = ""; enabled = $true }
  )
  _postman_variable_scope = "environment"
  _postman_exported_using = "lms-platform"
}

$content | ConvertTo-Json -Depth 6 | Set-Content -Path $OutPath -Encoding ASCII
Write-Host "Generated $OutPath"
