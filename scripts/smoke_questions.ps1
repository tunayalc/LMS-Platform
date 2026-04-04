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
  Join-Path $root ".env.local"
}
if (-not (Test-Path $envFilePath)) {
  throw "Missing env file: $envFilePath"
}
$envMap = Read-EnvFile $envFilePath

function Require-Env {
  param([string]$Key)
  if (-not $envMap.ContainsKey($Key) -or -not $envMap[$Key]) {
    throw "Missing $Key in .env.local"
  }
  return $envMap[$Key]
}

$mode = $envMap["LMS_MODE"]
if (-not $mode) { $mode = "local" }
$apiBase = if ($mode -eq "docker") {
  Require-Env "LMS_API_BASE_URL_DOCKER"
} else {
  Require-Env "LMS_API_BASE_URL_LOCAL"
}
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

function Patch-Json {
  param(
    [string]$Url,
    [object]$Body,
    [hashtable]$Headers
  )
  return Invoke-RestMethod -Uri $Url -Method Patch -TimeoutSec 10 -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 8)
}

function Patch-JsonRaw {
  param(
    [string]$Url,
    [string]$Body,
    [hashtable]$Headers
  )
  return Invoke-RestMethod -Uri $Url -Method Patch -TimeoutSec 10 -ContentType "application/json" -Headers $Headers -Body $Body
}

function Delete-Endpoint {
  param(
    [string]$Url,
    [hashtable]$Headers
  )
  return Invoke-RestMethod -Uri $Url -Method Delete -TimeoutSec 10 -Headers $Headers
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

$createdQuestionIds = @()
$questionIdMap = @{}
$examId = $null

try {
  $exam = Post-Json -Url "$apiBase/exams" -Headers $authHeaders -Body @{ title = "Smoke Questions Exam" }
  $examId = $exam.exam.id
  Write-Host "created.exam.id=$examId"

  $mcqId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
    prompt = "Basit MCQ soru?"
    type = "multiple_choice"
    examId = $examId
    options = @("A", "B", "C", "D")
    answer = "B"
  }).question.id
  $createdQuestionIds += $mcqId
  $questionIdMap["multiple_choice"] = $mcqId

  $multiId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
    prompt = "Birden fazla sec?"
    type = "multiple_select"
    examId = $examId
    options = @("A", "B", "C", "D")
    answer = @("A", "C")
  }).question.id
  $createdQuestionIds += $multiId
  $questionIdMap["multiple_select"] = $multiId

  $tfId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
    prompt = "Dunya yuvarlaktir."
    type = "true_false"
    examId = $examId
    answer = "Dogru"
  }).question.id
  $createdQuestionIds += $tfId
  $questionIdMap["true_false"] = $tfId

  $matchingId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
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
  $createdQuestionIds += $matchingId
  $questionIdMap["matching"] = $matchingId

  $orderingId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
    prompt = "Kucukten buyuge sirala."
    type = "ordering"
    examId = $examId
    meta = @{
      orderingItems = @("3", "1", "2")
    }
  }).question.id
  $createdQuestionIds += $orderingId
  $questionIdMap["ordering"] = $orderingId

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
  $fillBlankId = (Post-JsonRaw -Url "$apiBase/questions" -Headers $authHeaders -Body $fillBlankJson).question.id
  $createdQuestionIds += $fillBlankId
  $questionIdMap["fill_blank"] = $fillBlankId

  $shortId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
    prompt = "Turkiye'nin baskenti?"
    type = "short_answer"
    examId = $examId
    meta = @{
      shortAnswers = @("Ankara")
    }
  }).question.id
  $createdQuestionIds += $shortId
  $questionIdMap["short_answer"] = $shortId

  $longId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
    prompt = "Kisa bir aciklama yaz."
    type = "long_answer"
    examId = $examId
    meta = @{
      longAnswerGuide = "En az 2-3 cumle."
    }
  }).question.id
  $createdQuestionIds += $longId
  $questionIdMap["long_answer"] = $longId

  $fileId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
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
  $createdQuestionIds += $fileId
  $questionIdMap["file_upload"] = $fileId

  $calcId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
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
  $createdQuestionIds += $calcId
  $questionIdMap["calculation"] = $calcId

  $hotspotId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
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
  $createdQuestionIds += $hotspotId
  $questionIdMap["hotspot"] = $hotspotId

  $codeId = (Post-Json -Url "$apiBase/questions" -Headers $authHeaders -Body @{
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
  $createdQuestionIds += $codeId
  $questionIdMap["code"] = $codeId

  Write-Host "created.questions.count=$($createdQuestionIds.Count)"
  Write-Host "patching.questions..."

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["multiple_choice"])" -Headers $authHeaders -Body @{
    prompt = "MCQ guncel?"
    options = @("A", "B", "C", "D", "E")
    answer = "E"
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["multiple_select"])" -Headers $authHeaders -Body @{
    prompt = "Coklu secim guncel?"
    options = @("A", "B", "C", "D")
    answer = @("B", "D")
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["true_false"])" -Headers $authHeaders -Body @{
    prompt = "Dogru/Yanlis guncel?"
    answer = "Yanlis"
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["matching"])" -Headers $authHeaders -Body @{
    prompt = "Eslestirme guncel?"
    meta = @{
      matchingPairs = @(
        @{ left = "A"; right = "1" },
        @{ left = "B"; right = "2" }
      )
    }
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["ordering"])" -Headers $authHeaders -Body @{
    prompt = "Siralama guncel?"
    meta = @{
      orderingItems = @("2", "3", "1")
    }
  } | Out-Null

  $fillBlankPatch = @"
{
  "prompt": "Bosluk doldurma guncel?",
  "meta": {
    "blankAnswers": [
      ["Turkce", "Turkiye Turkcesi"]
    ]
  }
}
"@
  Patch-JsonRaw -Url "$apiBase/questions/$($questionIdMap["fill_blank"])" -Headers $authHeaders -Body $fillBlankPatch | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["short_answer"])" -Headers $authHeaders -Body @{
    prompt = "Kisa cevap guncel?"
    meta = @{ shortAnswers = @("Istanbul", "Ankara") }
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["long_answer"])" -Headers $authHeaders -Body @{
    prompt = "Uzun cevap guncel?"
    meta = @{ longAnswerGuide = "En az 4 cumle." }
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["file_upload"])" -Headers $authHeaders -Body @{
    prompt = "Dosya yukleme guncel?"
    meta = @{
      fileUpload = @{
        allowedTypes = @("application/pdf", "image/png")
        maxFiles = 2
        maxSizeMb = 10
      }
    }
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["calculation"])" -Headers $authHeaders -Body @{
    prompt = "Hesaplama guncel?"
    meta = @{
      calculation = @{
        formula = "a * b"
        variables = @(
          @{ name = "a"; min = 2; max = 4; step = 1 },
          @{ name = "b"; min = 3; max = 6; step = 1 }
        )
      }
    }
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["hotspot"])" -Headers $authHeaders -Body @{
    prompt = "Hotspot guncel?"
    meta = @{
      hotspot = @{
        imageUrl = "https://example.com/new.png"
        areas = @(
          @{ x = 5; y = 5; width = 60; height = 40 }
        )
      }
    }
  } | Out-Null

  Patch-Json -Url "$apiBase/questions/$($questionIdMap["code"])" -Headers $authHeaders -Body @{
    prompt = "Kod calistirma guncel?"
    meta = @{
      code = @{
        language = "python"
        starter = "def sum(a,b):\n    return a+b"
        tests = @(
          @{ input = "sum(2,3)"; output = "5" }
        )
      }
    }
  } | Out-Null

  Write-Host "patching.questions.ok"
} finally {
  foreach ($qid in $createdQuestionIds) {
    try {
      Delete-Endpoint -Url "$apiBase/questions/$qid" -Headers $authHeaders | Out-Null
    } catch {
      Write-Host "cleanup.question.failed=$qid"
    }
  }
  if ($examId) {
    try {
      Delete-Endpoint -Url "$apiBase/exams/$examId" -Headers $authHeaders | Out-Null
    } catch {
      Write-Host "cleanup.exam.failed=$examId"
    }
  }
}

Write-Host "question smoke ok"
