param(
  [string]$EnvFile
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
$envFilePath = if ($EnvFile) {
  if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $root $EnvFile }
} else {
  Join-Path $root ".env.docker"
}
if (-not (Test-Path $envFilePath)) {
  throw "Missing env file: $envFilePath"
}
$envMap = Read-EnvFile $envFilePath

function Require-Env {
  param([string]$Key)
  if (-not $envMap.ContainsKey($Key) -or -not $envMap[$Key]) {
    throw "Missing $Key in env file"
  }
  return $envMap[$Key]
}

$apiBase = Require-Env "LMS_API_BASE_URL_DOCKER"
$mode = Require-Env "LMS_MODE"
if ($mode -ne "docker") {
  throw "LMS_MODE is not 'docker'."
}
$authMode = $envMap["LMS_AUTH_MODE"]
if (-not $authMode) {
  $authMode = "mock"
}

Write-Host "API base (docker): $apiBase"

function Check-Endpoint {
  param([string]$Url)
  Write-Host "GET $Url"
  return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 10
}

function Post-Json {
  param(
    [string]$Url,
    [object]$Body,
    [hashtable]$Headers
  )
  return Invoke-RestMethod -Uri $Url -Method Post -TimeoutSec 10 -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json)
}

function Delete-Endpoint {
  param(
    [string]$Url,
    [hashtable]$Headers
  )
  return Invoke-RestMethod -Uri $Url -Method Delete -TimeoutSec 10 -Headers $Headers
}

$health = Check-Endpoint "$apiBase/health"
$version = Check-Endpoint "$apiBase/version"

Write-Host "health.status=$($health.status)"
Write-Host "version=$($version.version)"

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

if ($authMode -eq "mock") {
  $studentLogin = Post-Json -Url "$apiBase/auth/login" -Body @{ username = "student"; password = "1234" }
  $studentToken = if ($studentLogin.accessToken) { $studentLogin.accessToken } else { $studentLogin.token }
  $studentHeaders = @{ Authorization = "Bearer $studentToken" }
  $forbidden = $false
  try {
    Post-Json -Url "$apiBase/courses" -Headers $studentHeaders -Body @{ title = "Student Course"; description = "nope" } | Out-Null
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -eq 403) {
      $forbidden = $true
    } else {
      throw
    }
  }
  if (-not $forbidden) {
    throw "Expected forbidden for student create course."
  }
  Write-Host "forbidden check ok (student -> create course)"
}

$roles = Check-Endpoint "$apiBase/roles"
Write-Host "roles.count=$($roles.roles.Count)"

$users = Invoke-RestMethod -Uri "$apiBase/users" -Method Get -Headers $authHeaders -TimeoutSec 10
Write-Host "users.count=$($users.users.Count)"

$courses = Invoke-RestMethod -Uri "$apiBase/courses" -Method Get -Headers $authHeaders -TimeoutSec 10
$content = Invoke-RestMethod -Uri "$apiBase/content" -Method Get -Headers $authHeaders -TimeoutSec 10
$exams = Invoke-RestMethod -Uri "$apiBase/exams" -Method Get -Headers $authHeaders -TimeoutSec 10
$questions = Invoke-RestMethod -Uri "$apiBase/questions" -Method Get -Headers $authHeaders -TimeoutSec 10

Write-Host "courses.count=$($courses.courses.Count)"
Write-Host "content.count=$($content.content.Count)"
Write-Host "exams.count=$($exams.exams.Count)"
Write-Host "questions.count=$($questions.questions.Count)"

$createdCourse = Post-Json -Url "$apiBase/courses" -Headers $authHeaders -Body @{ title = "Smoke Course"; description = "smoke" }
$createdUser = Post-Json -Url "$apiBase/users" -Headers $authHeaders -Body @{ username = "smoke.user"; password = "Admin123!"; role = "Student" }
$createdContent = Post-Json -Url "$apiBase/content" -Headers $authHeaders -Body @{ title = "Smoke Content"; type = "video"; source = "https://example.invalid" }
$createdExam = Post-Json -Url "$apiBase/exams" -Headers $authHeaders -Body @{ title = "Smoke Exam"; courseId = $createdCourse.course.id }
$createdQuestion = Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{ examId = $createdExam.exam.id; prompt = "Smoke Q"; type = "multiple_choice"; options = @("A", "B"); answer = "A" }

Write-Host "created.course.id=$($createdCourse.course.id)"
Write-Host "created.user.id=$($createdUser.user.id)"
Write-Host "created.content.id=$($createdContent.content.id)"
Write-Host "created.exam.id=$($createdExam.exam.id)"
Write-Host "created.question.id=$($createdQuestion.question.id)"

Delete-Endpoint -Url "$apiBase/questions/$($createdQuestion.question.id)" -Headers $authHeaders | Out-Null
Delete-Endpoint -Url "$apiBase/exams/$($createdExam.exam.id)" -Headers $authHeaders | Out-Null
Delete-Endpoint -Url "$apiBase/content/$($createdContent.content.id)" -Headers $authHeaders | Out-Null
Delete-Endpoint -Url "$apiBase/users/$($createdUser.user.id)" -Headers $authHeaders | Out-Null
Delete-Endpoint -Url "$apiBase/courses/$($createdCourse.course.id)" -Headers $authHeaders | Out-Null

Write-Host "cleanup ok"

Write-Host "question smoke (docker)..."
& (Join-Path $root "scripts\\smoke_questions.ps1") -EnvFile $envFilePath
