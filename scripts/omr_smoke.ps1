param(
    [string]$OmrBaseUrl = "http://localhost:3002",
    [string]$ImagePath = ""
)

$ErrorActionPreference = "Stop"

if (-not $ImagePath) {
    $ImagePath = Join-Path $PSScriptRoot "..\\omr_example.jpg"
}
$ImagePath = (Resolve-Path $ImagePath).Path

function Get-ImageSize {
    param([string]$Path)
    try {
        $null = Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $img = [System.Drawing.Image]::FromFile($Path)
        try {
            return [pscustomobject]@{ Width = $img.Width; Height = $img.Height }
        } finally {
            $img.Dispose()
        }
    } catch {
        return $null
    }
}

function Invoke-OmrScan {
    param(
        [string]$BaseUrl,
        [string]$FilePath,
        [hashtable]$Fields,
        [string]$Label
    )

    $curl = (Get-Command curl.exe -ErrorAction SilentlyContinue)
    if (-not $curl) {
        throw "curl.exe not found (required for multipart POST on Windows PowerShell)."
    }

    $url = "$($BaseUrl.TrimEnd('/'))/scan"
    $args = @('-sS', '-X', 'POST', $url, '--max-time', '30', '-w', "`n%{http_code}", '-F', "file=@$FilePath")
    foreach ($key in $Fields.Keys) {
        $val = $Fields[$key]
        if ($null -ne $val -and "$val" -ne "") {
            $args += @('-F', "$key=$val")
        }
    }

    $raw = & $curl.Source @args 2>&1
    if (-not $raw) {
        Write-Host "[$Label] FAIL empty response"
        return $null
    }

    $lines = $raw -split "`r?`n"
    $statusLine = $lines[-1]
    $body = ($lines[0..($lines.Length - 2)] -join "`n")
    $status = 0
    [int]::TryParse($statusLine, [ref]$status) | Out-Null
    if ($status -lt 200 -or $status -ge 300) {
        Write-Host "[$Label] FAIL HTTP ${status}: $body"
        return $null
    }

    $json = $body | ConvertFrom-Json
        $warnings = @()
        if ($json -and $json.result -and $json.result.warnings) { $warnings = @($json.result.warnings) }
        $markedCount = 0
        if ($json -and $json.result -and $json.result.answers) {
            $markedCount = ($json.result.answers.PSObject.Properties | Where-Object { $_.Value -and "$($_.Value)".Trim() -ne "" }).Count
        }
        $debugImageLen = 0
        if ($json -and $json.result -and $json.result.debugImage) { $debugImageLen = ("$($json.result.debugImage)".Length) }
        Write-Host "[$Label] OK warnings=$($warnings -join ',') marked=$markedCount debugImageLen=$debugImageLen"
        return $json
}

if (-not (Test-Path $ImagePath)) {
    throw "Image not found: $ImagePath"
}

Write-Host "OMR smoke"
Write-Host "- Base: $OmrBaseUrl"
Write-Host "- Image: $ImagePath"

$manualCorners = "[[0,0],[1199,0],[1199,1599],[0,1599]]"

# Case 1: Default (debug on)
$null = Invoke-OmrScan -BaseUrl $OmrBaseUrl -FilePath $ImagePath -Label "default" -Fields @{
    debug      = "true"
    smartAlign = "true"
    skipWarp   = "false"
}

# Case 2: Skip warp
$null = Invoke-OmrScan -BaseUrl $OmrBaseUrl -FilePath $ImagePath -Label "skipWarp" -Fields @{
    debug      = "true"
    smartAlign = "true"
    skipWarp   = "true"
}

# Case 3: Manual corners
$null = Invoke-OmrScan -BaseUrl $OmrBaseUrl -FilePath $ImagePath -Label "manualCorners" -Fields @{
    debug         = "true"
    smartAlign    = "true"
    skipWarp      = "false"
    manualCorners = $manualCorners
}

Write-Host "Done."
