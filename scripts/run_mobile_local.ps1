param(
  [switch]$Tunnel,
  [switch]$Clear
)
$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$mobileEnvFile = Join-Path $root "apps\\mobile\\.env.local"
$fallbackEnvFile = Join-Path $root ".env.local"
$tunnelEnvFile = Join-Path $root ".env.tunnel.local"

# If Expo is started with --tunnel, prefer tunnel env so mobile can reach API remotely.
$sourceEnvFile = if ($Tunnel -and (Test-Path $tunnelEnvFile)) {
  $tunnelEnvFile
} elseif (Test-Path $mobileEnvFile) {
  $mobileEnvFile
} else {
  $fallbackEnvFile
}
if (-not (Test-Path $sourceEnvFile)) {
  throw "Missing env file for mobile. Run scripts\\detect_env.ps1 first."
}

function Read-EnvFile {
  param([string]$Path)
  $map = @{}
  foreach ($line in (Get-Content $Path -ErrorAction Stop)) {
    $trimmed = ([string]$line).Trim()
    if (-not $trimmed) { continue }
    if ($trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $val = $trimmed.Substring($idx + 1).Trim().Trim('"')
    $map[$key] = $val
  }
  return $map
}

function Resolve-LocalIPv4 {
  try {
    $virtualPatterns = @(
      "vEthernet",
      "Hyper-V",
      "Virtual",
      "VirtualBox",
      "VMware",
      "TAP",
      "VPN",
      "Loopback",
      "Tailscale",
      "WireGuard",
      "ZeroTier",
      "Hamachi"
    )
    $candidate = Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
      Where-Object {
        $name = $_.NetAdapter.Name
        $desc = $_.NetAdapter.InterfaceDescription
        -not ($virtualPatterns | Where-Object { $name -match $_ -or $desc -match $_ })
      } |
      ForEach-Object { $_.IPv4Address.IPAddress } |
      Where-Object { $_ -and $_ -ne "127.0.0.1" } |
      Select-Object -First 1
    if ($candidate) {
      return $candidate
    }
  } catch {
    # Fall back below.
  }
  return "127.0.0.1"
}

$sourceEnv = Read-EnvFile -Path $sourceEnvFile

# Always generate a fresh mobile env with current LAN IP to avoid stale IPs on physical devices.
# When using tunnel env, keep the base URLs from .env.tunnel.local.
$usingTunnelEnv = ($sourceEnvFile -eq $tunnelEnvFile)

$resolvedLocalHost = Resolve-LocalIPv4
$apiPort = if ($sourceEnv.ContainsKey("LMS_API_PORT")) { [int]$sourceEnv["LMS_API_PORT"] } else { 4000 }
$omrPort = if ($sourceEnv.ContainsKey("LMS_OMR_PORT")) { [int]$sourceEnv["LMS_OMR_PORT"] } else { 3002 }

$androidRuntime = if ($sourceEnv.ContainsKey("LMS_ANDROID_RUNTIME")) { $sourceEnv["LMS_ANDROID_RUNTIME"] } else { "emulator" }
$androidHost = if ($androidRuntime -eq "device") { $resolvedLocalHost } else { "10.0.2.2" }

$apiBaseLocal = if ($usingTunnelEnv -and $sourceEnv.ContainsKey("LMS_API_BASE_URL_LOCAL")) { $sourceEnv["LMS_API_BASE_URL_LOCAL"] } else { "http://$resolvedLocalHost`:$apiPort" }
$apiBaseAndroid = if ($usingTunnelEnv -and $sourceEnv.ContainsKey("LMS_API_BASE_URL_LOCAL_ANDROID")) { $sourceEnv["LMS_API_BASE_URL_LOCAL_ANDROID"] } else { "http://$androidHost`:$apiPort" }
$omrBaseLocal = if ($usingTunnelEnv -and $sourceEnv.ContainsKey("LMS_OMR_BASE_URL_LOCAL")) { $sourceEnv["LMS_OMR_BASE_URL_LOCAL"] } else { "http://$resolvedLocalHost`:$omrPort" }
$omrBaseAndroid = if ($usingTunnelEnv -and $sourceEnv.ContainsKey("LMS_OMR_BASE_URL_LOCAL_ANDROID")) { $sourceEnv["LMS_OMR_BASE_URL_LOCAL_ANDROID"] } else { "http://$androidHost`:$omrPort" }

$generatedEnvDir = Join-Path $root "logs"
if (-not (Test-Path $generatedEnvDir)) { New-Item -ItemType Directory -Path $generatedEnvDir | Out-Null }
$generatedEnvFile = Join-Path $generatedEnvDir "mobile.env.generated.local"

$lines = @()
foreach ($key in ($sourceEnv.Keys | Where-Object { $_ -like "LMS_*" } | Sort-Object)) {
  $lines += "$key=$($sourceEnv[$key])"
}

# Override base URLs with fresh values (unless using tunnel env).
$overrides = @{
  "LMS_MODE" = if ($sourceEnv.ContainsKey("LMS_MODE")) { $sourceEnv["LMS_MODE"] } else { "local" }
  "LMS_API_BASE_URL_LOCAL" = $apiBaseLocal
  "LMS_API_BASE_URL_LOCAL_ANDROID" = $apiBaseAndroid
  "LMS_API_BASE_URL_LOCAL_IOS" = $apiBaseLocal
  "LMS_OMR_BASE_URL_LOCAL" = $omrBaseLocal
  "LMS_OMR_BASE_URL_LOCAL_ANDROID" = $omrBaseAndroid
  "LMS_OMR_BASE_URL_LOCAL_IOS" = $omrBaseLocal
  "LMS_ANDROID_RUNTIME" = $androidRuntime
}

$lines = @($lines | Where-Object {
  $k = ($_ -split "=", 2)[0]
  -not $overrides.ContainsKey($k)
})
foreach ($k in ($overrides.Keys | Sort-Object)) {
  $lines += "$k=$($overrides[$k])"
}

$lines | Set-Content -Path $generatedEnvFile -Encoding ASCII
$env:LMS_ENV_FILE = $generatedEnvFile
Write-Host "Using generated mobile env: $generatedEnvFile"
Write-Host "API base (mobile): $apiBaseLocal"
Write-Host "OMR base (mobile): $omrBaseLocal"

Set-Location $root
$expoArgs = @("--go")
if ($Tunnel) { $expoArgs += "--tunnel" }
if ($Clear) { $expoArgs += "--clear" }

# Expo CLI can try to fetch remote metadata (doctor/version checks). If the network is flaky/blocked,
# Expo may crash before starting Metro, so run in offline mode by default (can be overridden by env).
if (-not $Tunnel -and -not $env:EXPO_OFFLINE) {
  $expoArgs += "--offline"
}

function Test-PortInUse {
  param([int]$Port)
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return [bool]$conn
  } catch {
    return $false
  }
}

# Avoid Expo's interactive "use another port" prompt.
$expoPort = 8081
if (Test-PortInUse -Port $expoPort) {
  foreach ($p in 8082..8095) {
    if (-not (Test-PortInUse -Port $p)) {
      $expoPort = $p
      break
    }
  }
}
$expoArgs += @("--port", "$expoPort")

pnpm --filter lms-mobile exec expo start $expoArgs
