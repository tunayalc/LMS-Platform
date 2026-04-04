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
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) {
  throw "Missing .env.local. Run scripts\\detect_env.ps1 first."
}
$envMap = Read-EnvFile $envFile

function Require-Env {
  param([string]$Key)
  if (-not $envMap.ContainsKey($Key) -or -not $envMap[$Key]) {
    throw "Missing $Key in .env.local"
  }
  return $envMap[$Key]
}

$apiBase = Require-Env "LMS_API_BASE_URL_LOCAL"
$authMode = $envMap["LMS_AUTH_MODE"]
if (-not $authMode) { $authMode = "mock" }

function Post-Json {
  param(
    [string]$Url,
    [object]$Body,
    [hashtable]$Headers
  )
  return Invoke-RestMethod -Uri $Url -Method Post -TimeoutSec 10 -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 6)
}

if ($authMode -eq "local") {
  try {
    Post-Json -Url "$apiBase/auth/bootstrap" -Body @{ username = "admin"; password = "Admin123!"; role = "SuperAdmin" } | Out-Null
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -ne 409) {
      throw
    }
  }
}

$loginUser = if ($authMode -eq "local") { "admin" } else { "Admin" }
$loginPassword = if ($authMode -eq "local") { "Admin123!" } else { "1234" }
$login = Post-Json -Url "$apiBase/auth/login" -Body @{ username = $loginUser; password = $loginPassword }
$token = if ($login.accessToken) { $login.accessToken } else { $login.token }
$authHeaders = @{ Authorization = "Bearer $token" }

$course = Post-Json -Url "$apiBase/courses" -Headers $authHeaders -Body @{
  title = "Demo Kurs"
  description = "Web demo icin olusturuldu."
}
Write-Host "created.course.id=$($course.course.id)"

$content = Post-Json -Url "$apiBase/content" -Headers $authHeaders -Body @{
  type = "video"
  title = "Demo Icerik"
  source = "https://example.com/video.mp4"
}
Write-Host "created.content.id=$($content.content.id)"

$exam = Post-Json -Url "$apiBase/exams" -Headers $authHeaders -Body @{
  title = "Demo Sinav"
  courseId = $course.course.id
}
Write-Host "created.exam.id=$($exam.exam.id)"

Write-Host "ready: open web dashboard to see course/content/exam"
