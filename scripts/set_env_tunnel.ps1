param(
  [Parameter(Mandatory = $true)][string]$WebUrl,
  [Parameter(Mandatory = $true)][string]$ApiUrl,
  [string]$OmrUrl,
  [string]$InFile = ".env.local",
  [string]$OutFile = ".env.tunnel.local",
  [switch]$ApplyAllPlatforms
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$inPath = Join-Path $root $InFile
$outPath = Join-Path $root $OutFile

if (-not (Test-Path $inPath)) {
  throw "Missing $InFile. Run scripts\\detect_env.ps1 first."
}

$lines = Get-Content $inPath

function Set-EnvLine {
  param([string]$Key, [string]$Value)
  $pattern = "^$Key="
  $updated = $false
  $next = foreach ($line in $script:lines) {
    if ($line -match $pattern) {
      $updated = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $updated) {
    $next += "$Key=$Value"
  }
  $script:lines = $next
}

Set-EnvLine -Key "LMS_WEB_BASE_URL" -Value $WebUrl
Set-EnvLine -Key "LMS_API_BASE_URL_LOCAL" -Value $ApiUrl
if ($ApplyAllPlatforms) {
  Set-EnvLine -Key "LMS_API_BASE_URL_LOCAL_ANDROID" -Value $ApiUrl
  Set-EnvLine -Key "LMS_API_BASE_URL_LOCAL_IOS" -Value $ApiUrl
}
if ($OmrUrl) {
  Set-EnvLine -Key "LMS_OMR_BASE_URL_LOCAL" -Value $OmrUrl
  if ($ApplyAllPlatforms) {
    Set-EnvLine -Key "LMS_OMR_BASE_URL_LOCAL_ANDROID" -Value $OmrUrl
    Set-EnvLine -Key "LMS_OMR_BASE_URL_LOCAL_IOS" -Value $OmrUrl
  }
}

$corsKey = "LMS_CORS_ORIGIN"
$corsLine = $lines | Where-Object { $_ -like "$corsKey=*" } | Select-Object -First 1
$corsValues = @()
if ($corsLine) {
  $raw = $corsLine.Substring($corsKey.Length + 1)
  $corsValues = $raw.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
if ($WebUrl -and -not ($corsValues -contains $WebUrl)) {
  $corsValues += $WebUrl
}
if ($corsValues.Count -gt 0) {
  Set-EnvLine -Key $corsKey -Value ($corsValues -join ",")
}

$lines | Set-Content -Path $outPath -Encoding ASCII
Write-Host "Generated $OutFile"
