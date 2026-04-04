param(
  [string]$ContainerName = "appflowy-cloud-postgres-1",
  [string]$ProxyName = "lms-pg-proxy",
  [int]$HostPort
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Get-FreePort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()
  return $port
}

function Get-ContainerEnvMap {
  param([string]$Name)
  $envJson = docker inspect $Name --format "{{json .Config.Env}}"
  if (-not $envJson) {
    throw "Container env not found for $Name"
  }
  $envList = $envJson | ConvertFrom-Json
  $map = @{}
  foreach ($item in $envList) {
    $parts = $item -split "=", 2
    if ($parts.Length -eq 2) {
      $map[$parts[0]] = $parts[1]
    }
  }
  return $map
}

function Get-ContainerNetwork {
  param([string]$Name)
  $netJson = docker inspect $Name --format "{{json .NetworkSettings.Networks}}"
  if (-not $netJson) {
    throw "Container network not found for $Name"
  }
  $netObj = $netJson | ConvertFrom-Json
  $first = $netObj.PSObject.Properties | Select-Object -First 1
  if (-not $first) {
    throw "Container network not found for $Name"
  }
  return $first.Name
}

function Ensure-Proxy {
  param([string]$Name, [string]$Network, [string]$Target, [int]$Port)
  $existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $Name }
  if ($existing) {
    $running = docker inspect $Name --format "{{.State.Running}}"
    if ($running -ne "true") {
      docker start $Name | Out-Null
    }
    $mapped = docker port $Name 5432
    if ($mapped) {
      return ($mapped -split ":")[-1]
    }
  }
  if (-not $Port) {
    $Port = Get-FreePort
  }
  docker run -d --name $Name --network $Network -p "$Port`:5432" alpine/socat -d -d TCP-LISTEN:5432,fork,reuseaddr TCP:$Target`:5432 | Out-Null
  return $Port
}

$envMap = Get-ContainerEnvMap -Name $ContainerName
$network = Get-ContainerNetwork -Name $ContainerName
$user = $envMap["POSTGRES_USER"]
$password = $envMap["POSTGRES_PASSWORD"]
$db = $envMap["POSTGRES_DB"]

if (-not $user -or -not $password -or -not $db) {
  throw "POSTGRES_USER/PASSWORD/DB not found in container env."
}

$port = Ensure-Proxy -Name $ProxyName -Network $network -Target $ContainerName -Port $HostPort
$dbUrl = "postgres://$user`:$password@localhost:$port/$db"

$envPath = Join-Path $root ".env.local"
if (-not (Test-Path $envPath)) {
  throw "Missing .env.local. Run scripts\\detect_env.ps1 first."
}
$lines = Get-Content $envPath
if ($lines -match "^LMS_DB_URL=") {
  $lines = $lines -replace "^LMS_DB_URL=.*$", "LMS_DB_URL=$dbUrl"
} else {
  $lines += "LMS_DB_URL=$dbUrl"
}
if ($lines -match "^LMS_DB_SSL=") {
  $lines = $lines -replace "^LMS_DB_SSL=.*$", "LMS_DB_SSL=false"
} else {
  $lines += "LMS_DB_SSL=false"
}
$lines | Set-Content -Path $envPath -Encoding ASCII

Write-Host "DB proxy ready on localhost:$port"
Write-Host "LMS_DB_URL=$dbUrl"
