param(
  [ValidateSet("local", "docker")]
  [string]$Mode = "local",
  [int]$ApiPort,
  [int]$WebPort,
  [int]$OmrPort,
  [int]$RedisPort,
  [int]$MinioPort,
  [int]$MinioConsolePort,
  [string]$MinioRootUser,
  [string]$MinioRootPassword,
  [string]$MinioBucket,
  [string]$RedisUrl,
  [string]$MinioEndpoint,
  [string]$MinioAccessKey,
  [string]$MinioSecretKey,
  [string]$PostgresUser,
  [string]$PostgresPassword,
  [string]$PostgresDb,
  [string]$LocalHost,
  [string]$AndroidHost,
  [ValidateSet("mock", "local")]
  [string]$AuthMode = "local",
  [ValidateSet("emulator", "device")]
  [string]$AndroidRuntime,
  [string]$DbUrl,
  [ValidateSet("auto", "postgres", "memory")]
  [string]$DbMode,
  [ValidateSet("true", "false")]
  [string]$DbSsl = "false",
  [ValidateSet("true", "false")]
  [string]$AndroidGoogleServices,
  [int]$RateLimitWindowMs,
  [int]$RateLimitMax,
  [string]$DockerApiBaseUrl,
  [string]$DockerWebBaseUrl,
  [string]$DockerOmrBaseUrl
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$existingEnvPath = Join-Path $root ".env.local"
if ($Mode -eq "docker") {
  $existingEnvPath = Join-Path $root ".env.docker"
}

function Get-ExistingEnvValue {
  param([string]$Key)
  if (-not (Test-Path $existingEnvPath)) {
    return $null
  }
  $line = Get-Content $existingEnvPath | Where-Object { $_ -like "$Key=*" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }
  return ($line -replace "^$Key=", "")
}

function Get-UrlParts {
  param([string]$Url)
  if (-not $Url) {
    return $null
  }
  try {
    $uri = [System.Uri]::new($Url)
    return @{
      Host = $uri.Host
      Port = $uri.Port
    }
  } catch {
    return $null
  }
}

function Get-FreePort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()
  return $port
}

function Test-PortInUse {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  return [bool]$conn
}

function Resolve-LocalHost {
  param([string]$InputHost)
  if ($InputHost) {
    return $InputHost
  }
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
    $candidates = Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
      Where-Object {
        $name = $_.NetAdapter.Name
        $desc = $_.NetAdapter.InterfaceDescription
        -not ($virtualPatterns | Where-Object { $name -match $_ -or $desc -match $_ })
      } |
      ForEach-Object { $_.IPv4Address.IPAddress } |
      Where-Object { $_ -and $_ -ne "127.0.0.1" } |
      Select-Object -First 1
    if ($candidates) {
      return $candidates
    }
  } catch {
    # Fallback to DNS-based resolution below.
  }
  try {
    $hostname = [System.Net.Dns]::GetHostName()
    $candidate = [System.Net.Dns]::GetHostAddresses($hostname) |
      Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
      Where-Object { $_.ToString() -ne "127.0.0.1" } |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.ToString()
    }
  } catch {
    # Fall back to loopback below.
  }
  return "127.0.0.1"
}

function Resolve-AndroidHost {
  param([string]$InputHost)
  if ($InputHost) {
    return $InputHost
  }
  return "10.0.2.2"
}

$existingApiPortValue = Get-ExistingEnvValue -Key "LMS_API_PORT"
$existingWebPortValue = Get-ExistingEnvValue -Key "LMS_WEB_PORT"
$existingOmrPortValue = Get-ExistingEnvValue -Key "LMS_OMR_PORT"
$existingApiBaseValue = Get-ExistingEnvValue -Key "LMS_API_BASE_URL_LOCAL"
$existingWebBaseValue = Get-ExistingEnvValue -Key "LMS_WEB_BASE_URL"
$existingAndroidBaseValue = Get-ExistingEnvValue -Key "LMS_API_BASE_URL_LOCAL_ANDROID"

$existingApiParts = Get-UrlParts -Url $existingApiBaseValue
$existingWebParts = Get-UrlParts -Url $existingWebBaseValue
$existingAndroidParts = Get-UrlParts -Url $existingAndroidBaseValue

$apiPortFromExisting = $false
$webPortFromExisting = $false
$omrPortFromExisting = $false

$resolvedApiPort = $ApiPort
if (-not $resolvedApiPort -and $existingApiPortValue) {
  $resolvedApiPort = [int]$existingApiPortValue
  $apiPortFromExisting = $true
}
if (-not $resolvedApiPort -and $existingApiParts) {
  $resolvedApiPort = [int]$existingApiParts.Port
  $apiPortFromExisting = $true
}
$resolvedWebPort = $WebPort
if (-not $resolvedWebPort -and $existingWebPortValue) {
  $resolvedWebPort = [int]$existingWebPortValue
  $webPortFromExisting = $true
}
if (-not $resolvedWebPort -and $existingWebParts) {
  $resolvedWebPort = [int]$existingWebParts.Port
  $webPortFromExisting = $true
}
$resolvedOmrPort = $OmrPort
if (-not $resolvedOmrPort -and $existingOmrPortValue) {
  $resolvedOmrPort = [int]$existingOmrPortValue
  $omrPortFromExisting = $true
}

$LocalHost = if (-not $LocalHost -and $existingApiParts) { $existingApiParts.Host } else { $LocalHost }
$LocalHost = if (-not $LocalHost -and $existingWebParts) { $existingWebParts.Host } else { $LocalHost }
$AndroidHost = if (-not $AndroidHost -and $existingAndroidParts) { $existingAndroidParts.Host } else { $AndroidHost }

if (-not $resolvedApiPort) {
  $resolvedApiPort = Get-FreePort
} elseif (-not $apiPortFromExisting) {
  if (Test-PortInUse -Port $resolvedApiPort) {
    throw "Port $resolvedApiPort is already in use."
  }
} elseif (Test-PortInUse -Port $resolvedApiPort) {
  Write-Host "Reusing existing LMS_API_PORT=$resolvedApiPort (port currently in use)."
}

if (-not $resolvedWebPort) {
  $resolvedWebPort = Get-FreePort
} elseif (-not $webPortFromExisting) {
  if (Test-PortInUse -Port $resolvedWebPort) {
    throw "Port $resolvedWebPort is already in use."
  }
} elseif (Test-PortInUse -Port $resolvedWebPort) {
  Write-Host "Reusing existing LMS_WEB_PORT=$resolvedWebPort (port currently in use)."
}

if ($resolvedWebPort -eq $resolvedApiPort) {
  $resolvedWebPort = Get-FreePort
}

if (-not $resolvedOmrPort) {
  $resolvedOmrPort = Get-FreePort
} elseif (-not $omrPortFromExisting) {
  if (Test-PortInUse -Port $resolvedOmrPort) {
    throw "Port $resolvedOmrPort is already in use."
  }
} elseif (Test-PortInUse -Port $resolvedOmrPort) {
  Write-Host "Reusing existing LMS_OMR_PORT=$resolvedOmrPort (port currently in use)."
}

$reservedPorts = @($resolvedApiPort, $resolvedWebPort)
if ($OmrPort -and ($reservedPorts -contains $resolvedOmrPort)) {
  throw "OmrPort $resolvedOmrPort conflicts with API/Web port."
}

while (-not $OmrPort -and ($reservedPorts -contains $resolvedOmrPort)) {
  $resolvedOmrPort = Get-FreePort
}

if ($Mode -eq "local") {
  $smtpHost = Get-ExistingEnvValue -Key "SMTP_HOST"
  $smtpPort = Get-ExistingEnvValue -Key "SMTP_PORT"
  if (-not $smtpPort) {
    $smtpPort = "587"
  }
  $smtpUser = Get-ExistingEnvValue -Key "SMTP_USER"
  $smtpPass = Get-ExistingEnvValue -Key "SMTP_PASS"
  $smtpFrom = Get-ExistingEnvValue -Key "SMTP_FROM"
  if (-not $smtpFrom) {
    $smtpFrom = "LMS <noreply@lms.local>"
  }
  $googleClientId = Get-ExistingEnvValue -Key "GOOGLE_CLIENT_ID"
  $googleClientSecret = Get-ExistingEnvValue -Key "GOOGLE_CLIENT_SECRET"
  $googleCallbackUrl = Get-ExistingEnvValue -Key "GOOGLE_CALLBACK_URL"
  $nextGoogleClientId = Get-ExistingEnvValue -Key "NEXT_PUBLIC_GOOGLE_CLIENT_ID"
  $nextGoogleApiKey = Get-ExistingEnvValue -Key "NEXT_PUBLIC_GOOGLE_API_KEY"
  $jitsiAppId = Get-ExistingEnvValue -Key "JITSI_APP_ID"
  $jitsiPrivateKeyPath = Get-ExistingEnvValue -Key "JITSI_PRIVATE_KEY_PATH"
  $mattermostUrl = Get-ExistingEnvValue -Key "MATTERMOST_URL"
  $mattermostToken = Get-ExistingEnvValue -Key "MATTERMOST_TOKEN"
  $mattermostWebhookUrl = Get-ExistingEnvValue -Key "MATTERMOST_WEBHOOK_URL"
  $mattermostTeamId = Get-ExistingEnvValue -Key "MATTERMOST_TEAM_ID"
  $microsoftMode = Get-ExistingEnvValue -Key "MICROSOFT_MODE"
  if (-not $microsoftMode) {
    $microsoftMode = "mock"
  }
  $microsoftClientId = Get-ExistingEnvValue -Key "MICROSOFT_CLIENT_ID"
  $microsoftClientSecret = Get-ExistingEnvValue -Key "MICROSOFT_CLIENT_SECRET"
  $microsoftCallbackUrl = Get-ExistingEnvValue -Key "MICROSOFT_CALLBACK_URL"
  $resolvedLocalHost = Resolve-LocalHost -InputHost $LocalHost
  $resolvedAndroidHost = Resolve-AndroidHost -InputHost $AndroidHost
  if (-not $AndroidRuntime) {
    $val = Get-ExistingEnvValue -Key "LMS_ANDROID_RUNTIME"
    if ($val -eq "device") {
      $AndroidRuntime = "device"
    } else {
      $AndroidRuntime = "emulator"
    }
  }
  $resolvedAndroidGoogleServices = $AndroidGoogleServices
  if (-not $resolvedAndroidGoogleServices) {
    $resolvedAndroidGoogleServices = Get-ExistingEnvValue -Key "LMS_ANDROID_GOOGLE_SERVICES"
  }
  $resolvedDbUrl = $DbUrl
  if (-not $resolvedDbUrl) {
    $resolvedDbUrl = Get-ExistingEnvValue -Key "LMS_DB_URL"
  }
  $resolvedDbParts = $null
  if ($resolvedDbUrl) {
    $resolvedDbParts = Get-UrlParts -Url $resolvedDbUrl
  }
  $resolvedDbMode = $DbMode
  if (-not $resolvedDbMode) {
    $resolvedDbMode = Get-ExistingEnvValue -Key "LMS_DB_MODE"
  }
  if (-not $resolvedDbMode) {
    $resolvedDbMode = "auto"
  }
  $resolvedDbSsl = $DbSsl
  if (-not $resolvedDbSsl) {
    $resolvedDbSsl = Get-ExistingEnvValue -Key "LMS_DB_SSL"
  }
  if (-not $resolvedDbSsl) {
    $resolvedDbSsl = "false"
  }
  $resolvedRateLimitWindowMs = $RateLimitWindowMs
  if (-not $resolvedRateLimitWindowMs) {
    $resolvedRateLimitWindowMs = Get-ExistingEnvValue -Key "LMS_RATE_LIMIT_WINDOW_MS"
  }
  if (-not $resolvedRateLimitWindowMs) {
    $resolvedRateLimitWindowMs = "60000"
  }
  $resolvedRateLimitMax = $RateLimitMax
  if (-not $resolvedRateLimitMax) {
    $resolvedRateLimitMax = Get-ExistingEnvValue -Key "LMS_RATE_LIMIT_MAX"
  }
  if (-not $resolvedRateLimitMax) {
    $resolvedRateLimitMax = "120"
  }
  if (-not $resolvedAndroidGoogleServices) {
    $resolvedAndroidGoogleServices = "false"
  }

  if ($resolvedDbMode -ne "memory" -and $resolvedDbParts) {
    $dbHost = $resolvedDbParts.Host
    $dbPort = [int]$resolvedDbParts.Port
    if ($dbHost -and $dbPort -and ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1")) {
      if (-not (Test-PortInUse -Port $dbPort)) {
        Write-Host "Postgres not reachable on $dbHost`:$dbPort. Switching to in-memory DB."
        $resolvedDbMode = "memory"
      }
    }
  }

  $apiBaseLocal = "http://$resolvedLocalHost`:$resolvedApiPort"
  $apiBaseAndroid = "http://$resolvedAndroidHost`:$resolvedApiPort"
  $webBaseLocal = "http://$resolvedLocalHost`:$resolvedWebPort"
  $omrBaseLocal = "http://$resolvedLocalHost`:$resolvedOmrPort"
  $omrBaseAndroid = "http://$resolvedAndroidHost`:$resolvedOmrPort"
  $localhostWebBase = "http://localhost`:$resolvedWebPort"
  $corsOrigins = @($webBaseLocal)
  if ($webBaseLocal -ne $localhostWebBase) {
    $corsOrigins += $localhostWebBase
  }
  $corsOriginValue = ($corsOrigins | Select-Object -Unique) -join ","

  $lines = @(
    "LMS_MODE=local",
    "LMS_API_PORT=$resolvedApiPort",
    "LMS_WEB_PORT=$resolvedWebPort",
    "LMS_OMR_PORT=$resolvedOmrPort",
    "LMS_API_NAME=LMS API",
    "LMS_API_VERSION=0.1.0",
    "LMS_AUTH_MODE=$AuthMode",
    "LMS_WEB_URL=$webBaseLocal",
    "LMS_API_BASE_URL_LOCAL=$apiBaseLocal",
    "LMS_API_BASE_URL_LOCAL_ANDROID=$apiBaseAndroid",
    "LMS_API_BASE_URL_LOCAL_IOS=$apiBaseLocal",
    "LMS_WEB_BASE_URL=$webBaseLocal",
    "LMS_CORS_ORIGIN=$corsOriginValue",
    "LMS_OMR_BASE_URL_LOCAL=$omrBaseLocal",
    "LMS_OMR_BASE_URL_LOCAL_ANDROID=$omrBaseAndroid",
    "LMS_OMR_BASE_URL_LOCAL_IOS=$omrBaseLocal",
    "LMS_ANDROID_RUNTIME=$AndroidRuntime",
    "LMS_ANDROID_GOOGLE_SERVICES=$resolvedAndroidGoogleServices",
    "LMS_RATE_LIMIT_WINDOW_MS=$resolvedRateLimitWindowMs",
    "LMS_RATE_LIMIT_MAX=$resolvedRateLimitMax",
    "LMS_DB_URL=$resolvedDbUrl",
    "LMS_DB_MODE=$resolvedDbMode",
    "LMS_DB_SSL=$resolvedDbSsl",
    "SMTP_HOST=$smtpHost",
    "SMTP_PORT=$smtpPort",
    "SMTP_USER=$smtpUser",
    "SMTP_PASS=$smtpPass",
    "SMTP_FROM=$smtpFrom",
    "GOOGLE_CLIENT_ID=$googleClientId",
    "GOOGLE_CLIENT_SECRET=$googleClientSecret",
    "GOOGLE_CALLBACK_URL=$googleCallbackUrl",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID=$nextGoogleClientId",
    "NEXT_PUBLIC_GOOGLE_API_KEY=$nextGoogleApiKey",
    "JITSI_APP_ID=$jitsiAppId",
    "JITSI_PRIVATE_KEY_PATH=$jitsiPrivateKeyPath",
    "MATTERMOST_URL=$mattermostUrl",
    "MATTERMOST_TOKEN=$mattermostToken",
    "MATTERMOST_WEBHOOK_URL=$mattermostWebhookUrl",
    "MATTERMOST_TEAM_ID=$mattermostTeamId",
    "MICROSOFT_MODE=$microsoftMode",
    "MICROSOFT_CLIENT_ID=$microsoftClientId",
    "MICROSOFT_CLIENT_SECRET=$microsoftClientSecret",
    "MICROSOFT_CALLBACK_URL=$microsoftCallbackUrl"
  )

  if ($DockerApiBaseUrl) {
    $lines += "LMS_API_BASE_URL_DOCKER=$DockerApiBaseUrl"
  } else {
    $lines += "LMS_API_BASE_URL_DOCKER="
  }

  if ($DockerOmrBaseUrl) {
    $lines += "LMS_OMR_BASE_URL_DOCKER=$DockerOmrBaseUrl"
  } else {
    $lines += "LMS_OMR_BASE_URL_DOCKER="
  }

  $lines | Set-Content -Path (Join-Path $root ".env.local") -Encoding ASCII
  Write-Host "Generated .env.local"
  Write-Host "Local host: $resolvedLocalHost"
  Write-Host "Android host: $resolvedAndroidHost"
  Write-Host "API base: $apiBaseLocal"
  Write-Host "Web base: $webBaseLocal"
  Write-Host "Android base: $apiBaseAndroid"
  Write-Host "OMR base: $omrBaseLocal"

  $postmanEnv = @{
    name = "LMS Local"
    values = @(
      @{ key = "apiBaseUrl"; value = $apiBaseLocal; enabled = $true }
      @{ key = "omrBaseUrl"; value = $omrBaseLocal; enabled = $true }
      @{ key = "token"; value = ""; enabled = $true }
      @{ key = "courseId"; value = ""; enabled = $true }
      @{ key = "examId"; value = ""; enabled = $true }
      @{ key = "contentId"; value = ""; enabled = $true }
      @{ key = "userId"; value = ""; enabled = $true }
    )
    _postman_variable_scope = "environment"
    _postman_exported_using = "lms-platform"
  }
  $postmanEnvPath = Join-Path $root "postman_environment_local.json"
  $postmanEnv | ConvertTo-Json -Depth 6 | Set-Content -Path $postmanEnvPath -Encoding ASCII
  Write-Host "Generated postman_environment_local.json"
}

if ($Mode -eq "docker") {
  if (-not $DockerApiBaseUrl) {
    throw "DockerApiBaseUrl is required for docker mode."
  }
  if (-not $DockerWebBaseUrl) {
    throw "DockerWebBaseUrl is required for docker mode."
  }

  if (-not $PostgresUser) {
    $PostgresUser = Get-ExistingEnvValue -Key "POSTGRES_USER"
  }
  if (-not $PostgresUser) {
    $PostgresUser = "lms"
  }
  if (-not $PostgresPassword) {
    $PostgresPassword = Get-ExistingEnvValue -Key "POSTGRES_PASSWORD"
  }
  if (-not $PostgresPassword) {
    $PostgresPassword = "lms"
  }
  if (-not $PostgresDb) {
    $PostgresDb = Get-ExistingEnvValue -Key "POSTGRES_DB"
  }
  if (-not $PostgresDb) {
    $PostgresDb = "lms"
  }

  $resolvedDbUrl = $DbUrl
  if (-not $resolvedDbUrl) {
    $resolvedDbUrl = Get-ExistingEnvValue -Key "LMS_DB_URL"
  }
  if (-not $resolvedDbUrl) {
    $resolvedDbUrl = "postgres://${PostgresUser}:${PostgresPassword}@postgres:5432/${PostgresDb}"
  }
  $resolvedDbMode = $DbMode
  if (-not $resolvedDbMode) {
    $resolvedDbMode = Get-ExistingEnvValue -Key "LMS_DB_MODE"
  }
  if (-not $resolvedDbMode) {
    $resolvedDbMode = "postgres"
  }
  $resolvedDbSsl = $DbSsl
  if (-not $resolvedDbSsl) {
    $resolvedDbSsl = Get-ExistingEnvValue -Key "LMS_DB_SSL"
  }
  if (-not $resolvedDbSsl) {
    $resolvedDbSsl = "false"
  }
  $resolvedAndroidGoogleServices = $AndroidGoogleServices
  if (-not $resolvedAndroidGoogleServices) {
    $resolvedAndroidGoogleServices = Get-ExistingEnvValue -Key "LMS_ANDROID_GOOGLE_SERVICES"
  }
  if (-not $resolvedAndroidGoogleServices) {
    $resolvedAndroidGoogleServices = "false"
  }

  $resolvedRateLimitWindowMs = $RateLimitWindowMs
  if (-not $resolvedRateLimitWindowMs) {
    $resolvedRateLimitWindowMs = Get-ExistingEnvValue -Key "LMS_RATE_LIMIT_WINDOW_MS"
  }
  if (-not $resolvedRateLimitWindowMs) {
    $resolvedRateLimitWindowMs = "60000"
  }
  $resolvedRateLimitMax = $RateLimitMax
  if (-not $resolvedRateLimitMax) {
    $resolvedRateLimitMax = Get-ExistingEnvValue -Key "LMS_RATE_LIMIT_MAX"
  }
  if (-not $resolvedRateLimitMax) {
    $resolvedRateLimitMax = "120"
  }

  $resolvedRedisPort = $RedisPort
  if (-not $resolvedRedisPort) {
    $resolvedRedisPort = Get-ExistingEnvValue -Key "LMS_REDIS_PORT"
  }
  if (-not $resolvedRedisPort) {
    $resolvedRedisPort = Get-FreePort
  }

  $resolvedMinioPort = $MinioPort
  if (-not $resolvedMinioPort) {
    $resolvedMinioPort = Get-ExistingEnvValue -Key "LMS_MINIO_PORT"
  }
  if (-not $resolvedMinioPort) {
    $resolvedMinioPort = Get-FreePort
  }

  $resolvedMinioConsolePort = $MinioConsolePort
  if (-not $resolvedMinioConsolePort) {
    $resolvedMinioConsolePort = Get-ExistingEnvValue -Key "LMS_MINIO_CONSOLE_PORT"
  }
  if (-not $resolvedMinioConsolePort) {
    $resolvedMinioConsolePort = Get-FreePort
  }

  if (-not $MinioRootUser) {
    $MinioRootUser = Get-ExistingEnvValue -Key "MINIO_ROOT_USER"
  }
  if (-not $MinioRootUser) {
    $MinioRootUser = "minioadmin"
  }

  if (-not $MinioRootPassword) {
    $MinioRootPassword = Get-ExistingEnvValue -Key "MINIO_ROOT_PASSWORD"
  }
  if (-not $MinioRootPassword) {
    $MinioRootPassword = "minioadmin"
  }

  if (-not $MinioBucket) {
    $MinioBucket = Get-ExistingEnvValue -Key "LMS_MINIO_BUCKET"
  }
  if (-not $MinioBucket) {
    $MinioBucket = "lms-media"
  }

  if (-not $RedisUrl) {
    $RedisUrl = Get-ExistingEnvValue -Key "LMS_REDIS_URL"
  }
  if (-not $RedisUrl) {
    $RedisUrl = "redis://redis:6379"
  }

  if (-not $MinioEndpoint) {
    $MinioEndpoint = Get-ExistingEnvValue -Key "LMS_MINIO_ENDPOINT"
  }
  if (-not $MinioEndpoint) {
    $MinioEndpoint = "http://minio:9000"
  }

  if (-not $MinioAccessKey) {
    $MinioAccessKey = Get-ExistingEnvValue -Key "LMS_MINIO_ACCESS_KEY"
  }
  if (-not $MinioAccessKey) {
    $MinioAccessKey = $MinioRootUser
  }

  if (-not $MinioSecretKey) {
    $MinioSecretKey = Get-ExistingEnvValue -Key "LMS_MINIO_SECRET_KEY"
  }
  if (-not $MinioSecretKey) {
    $MinioSecretKey = $MinioRootPassword
  }

  $lines = @(
    "LMS_MODE=docker",
    "LMS_API_PORT=$resolvedApiPort",
    "LMS_WEB_PORT=$resolvedWebPort",
    "LMS_OMR_PORT=$resolvedOmrPort",
    "LMS_API_NAME=LMS API",
    "LMS_API_VERSION=0.1.0",
    "LMS_AUTH_MODE=$AuthMode",
    "POSTGRES_USER=$PostgresUser",
    "POSTGRES_PASSWORD=$PostgresPassword",
    "POSTGRES_DB=$PostgresDb",
    "LMS_API_BASE_URL_DOCKER=$DockerApiBaseUrl",
    "LMS_WEB_BASE_URL=$DockerWebBaseUrl",
    "LMS_CORS_ORIGIN=$DockerWebBaseUrl",
    "LMS_ANDROID_GOOGLE_SERVICES=$resolvedAndroidGoogleServices",
    "LMS_RATE_LIMIT_WINDOW_MS=$resolvedRateLimitWindowMs",
    "LMS_RATE_LIMIT_MAX=$resolvedRateLimitMax",
    "LMS_REDIS_PORT=$resolvedRedisPort",
    "LMS_MINIO_PORT=$resolvedMinioPort",
    "LMS_MINIO_CONSOLE_PORT=$resolvedMinioConsolePort",
    "MINIO_ROOT_USER=$MinioRootUser",
    "MINIO_ROOT_PASSWORD=$MinioRootPassword",
    "LMS_REDIS_URL=$RedisUrl",
    "LMS_MINIO_ENDPOINT=$MinioEndpoint",
    "LMS_MINIO_ACCESS_KEY=$MinioAccessKey",
    "LMS_MINIO_SECRET_KEY=$MinioSecretKey",
    "LMS_MINIO_BUCKET=$MinioBucket",
    "LMS_DB_URL=$resolvedDbUrl",
    "LMS_DB_MODE=$resolvedDbMode",
    "LMS_DB_SSL=$resolvedDbSsl"
  )

  if ($DockerOmrBaseUrl) {
    $lines += "LMS_OMR_BASE_URL_DOCKER=$DockerOmrBaseUrl"
  } else {
    $lines += "LMS_OMR_BASE_URL_DOCKER="
  }

  $lines | Set-Content -Path (Join-Path $root ".env.docker") -Encoding ASCII
  Write-Host "Generated .env.docker"
}
