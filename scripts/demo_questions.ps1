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
  return Invoke-RestMethod -Uri $Url -Method Post -TimeoutSec 10 -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 8)
}

function Post-JsonRaw {
  param(
    [string]$Url,
    [string]$Body,
    [hashtable]$Headers
  )
  return Invoke-RestMethod -Uri $Url -Method Post -TimeoutSec 10 -ContentType "application/json" -Headers $Headers -Body $Body
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
  title = "Soru Demo Kurs"
  description = "Soru tipleri icin olusturuldu."
}
Write-Host "created.course.id=$($course.course.id)"

$examBody = @{ title = "Web Demo Sinav" }
if ($null -ne $course -and $null -ne $course.course -and $course.course.id) {
  $examBody.courseId = $course.course.id
} else {
  Write-Host "warn: courseId missing, exam will be created without courseId"
}
$exam = Post-Json -Url "$apiBase/exams" -Headers $authHeaders -Body $examBody
$examId = $exam.exam.id
Write-Host "created.exam.id=$examId"

$questionIds = @()
$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Basit MCQ soru?"
  type = "multiple_choice"
  examId = $examId
  options = @("A", "B", "C", "D")
  answer = "B"
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Birden fazla sec?"
  type = "multiple_select"
  examId = $examId
  options = @("A", "B", "C", "D")
  answer = @("A", "C")
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Dunya yuvarlaktir."
  type = "true_false"
  examId = $examId
  answer = "Dogru"
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Eslestir."
  type = "matching"
  examId = $examId
  meta = @{
    matchingPairs = @(
      @{ left = "1"; right = "Bir" },
      @{ left = "2"; right = "Iki" }
    )
  }
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Kucukten buyuge sirala."
  type = "ordering"
  examId = $examId
  meta = @{
    orderingItems = @("3", "1", "2")
  }
}).question.id

$fillBlankJson = @"
{
  "prompt": "___ bir dildir.",
  "type": "fill_blank",
  "examId": "$examId",
  "meta": {
    "blankAnswers": [
      ["Turkce", "TURKCE"]
    ]
  }
}
"@
$questionIds += (Post-JsonRaw -Url "$apiBase/questions" -Headers $authHeaders -Body $fillBlankJson).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Turkiye'nin baskenti?"
  type = "short_answer"
  examId = $examId
  meta = @{
    shortAnswers = @("Ankara")
  }
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Kisa bir aciklama yaz."
  type = "long_answer"
  examId = $examId
  meta = @{
    longAnswerGuide = "En az 2-3 cumle."
  }
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "PDF odev yukle."
  type = "file_upload"
  examId = $examId
  meta = @{
    fileUpload = @{
      allowedTypes = @("application/pdf")
      maxFiles = 1
      maxSizeMb = 5
    }
  }
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "a + b hesapla."
  type = "calculation"
  examId = $examId
  meta = @{
    calculation = @{
      formula = "a + b"
      variables = @(
        @{ name = "a"; min = 1; max = 5; step = 1 },
        @{ name = "b"; min = 2; max = 6; step = 1 }
      )
    }
  }
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Isaretli alani sec."
  type = "hotspot"
  examId = $examId
  meta = @{
    hotspot = @{
      imageUrl = "https://example.com/image.png"
      areas = @(
        @{ x = 10; y = 10; width = 100; height = 80 }
      )
    }
  }
}).question.id

$questionIds += (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
  prompt = "Toplama fonksiyonu yaz."
  type = "code"
  examId = $examId
  meta = @{
    code = @{
      language = "javascript"
      starter = "function sum(a,b){ return a+b; }"
      tests = @(
        @{ input = "sum(1,2)"; output = "3" }
      )
    }
  }
}).question.id

Write-Host "created.questions.count=$($questionIds.Count)"
Write-Host "ready: open web dashboard and try edit/update"
