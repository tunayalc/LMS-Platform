
$BaseUrl = "http://localhost:3001"

Write-Host "Starting Verification..." -ForegroundColor Cyan

# 1. Test Plagiarism Endpoint
Write-Host "`n1. Testing Plagiarism Endpoint..." -ForegroundColor Yellow
try {
    $plagiarismBody = @{
        text1 = "Yapay zeka günümüzde çok popüler bir konudur."
        text2 = "Yapay zeka bugünlerde oldukça popüler bir konu."
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$BaseUrl/api/plagiarism/compare" -Method Post -Body $plagiarismBody -ContentType "application/json" -ErrorAction Stop
    Write-Host "Success! Similarity: $($response.similarity)" -ForegroundColor Green
} catch {
    Write-Host "Failed to connect or error response. Ensure server is running on port 3001." -ForegroundColor Red
    Write-Host $_.Exception.Message
}

# 2. Test LDAP Mock Login
Write-Host "`n2. Testing LDAP Mock Login..." -ForegroundColor Yellow
try {
    $ldapBody = @{
        username = "testuser"
        password = "anypassword"
    } | ConvertTo-Json

    # header needed if we implemented it, but currently auth endpoints usually open or handle it.
    # Note: LDAP mock checks process.env.LMS_AUTH_MODE = 'mock'. If not set, it might fail or try real connection.
    # But let's try.
    $response = Invoke-RestMethod -Uri "$BaseUrl/auth/ldap/login" -Method Post -Body $ldapBody -ContentType "application/json" -ErrorAction Stop
    Write-Host "Success! Logged in as: $($response.user.username)" -ForegroundColor Green
    Write-Host "Token received: $($response.accessToken.Substring(0, 10))..." -ForegroundColor Gray
} catch {
    Write-Host "LDAP Login Failed." -ForegroundColor Red
    Write-Host $_.Exception.Message
}

# 3. Test Push Endpoint (Using dummy token)
Write-Host "`n3. Testing Push Notification Endpoint..." -ForegroundColor Yellow
try {
    $pushBody = @{
        token = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
        title = "Auto Test"
        body = "This is a verification test."
    } | ConvertTo-Json

    # This endpoint is protected by Admin check in our code: 
    # if (!req.user || !['SuperAdmin', 'Admin'].includes(req.user.role))
    # So this unauthenticated request SHOULD fail with 403 or 401.
    
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/push/test" -Method Post -Body $pushBody -ContentType "application/json" -ErrorAction Stop
        Write-Host "Success? (Unexpected for unauth): $($response)" -ForegroundColor Magenta
    } catch {
        if ($_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::Forbidden ) {
            Write-Host "Success! Received expected 403 Forbidden (Auth check working)." -ForegroundColor Green
        }
        else {
             Write-Host "Received $($_.Exception.Response.StatusCode) - ($_.Exception.Message)" -ForegroundColor Gray
        }
    }
} catch {
     Write-Host "Error connecting." -ForegroundColor Red
}

Write-Host "`nVerification Complete. If you saw Red errors, make sure to run 'npm run dev' first." -ForegroundColor Cyan
