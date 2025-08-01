# Test login endpoint
Write-Host "Testing login endpoint..." -ForegroundColor Green
$loginResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/auth/login' -Method Post -ContentType 'application/json' -Body (Get-Content 'test_login_request.json' -Raw)
Write-Host "Login Response:" -ForegroundColor Yellow
$loginResponse | ConvertTo-Json -Depth 10

# Extract access token
$accessToken = $loginResponse.access_token
Write-Host "`nAccess Token: $accessToken" -ForegroundColor Cyan

# Test /api/users/me endpoint with the access token
Write-Host "`nTesting /api/users/me endpoint..." -ForegroundColor Green
try {
    $headers = @{
        'Authorization' = "Bearer $accessToken"
        'Content-Type' = 'application/json'
    }
    $meResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/users/me' -Method Get -Headers $headers
    Write-Host "Me Response:" -ForegroundColor Yellow
    $meResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error accessing /api/users/me: $($_.Exception.Message)" -ForegroundColor Red
}

# Test refresh token endpoint
Write-Host "`nTesting refresh token endpoint..." -ForegroundColor Green
try {
    $refreshBody = @{
        refresh_token = $loginResponse.refresh_token
    } | ConvertTo-Json
    
    $refreshResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/auth/refresh' -Method Post -ContentType 'application/json' -Body $refreshBody
    Write-Host "Refresh Response:" -ForegroundColor Yellow
    $refreshResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error refreshing token: $($_.Exception.Message)" -ForegroundColor Red
}

# Test logout endpoint
Write-Host "`nTesting logout endpoint..." -ForegroundColor Green
try {
    $logoutResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/auth/logout' -Method Post -Headers $headers
    Write-Host "Logout Response:" -ForegroundColor Yellow
    $logoutResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error during logout: $($_.Exception.Message)" -ForegroundColor Red
}

# Test accessing /api/users/me after logout (should fail)
Write-Host "`nTesting /api/users/me after logout (should fail)..." -ForegroundColor Green
try {
    $meAfterLogoutResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/users/me' -Method Get -Headers $headers
    Write-Host "Unexpected success - token should be blacklisted!" -ForegroundColor Red
    $meAfterLogoutResponse | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Expected error (token blacklisted): $($_.Exception.Message)" -ForegroundColor Green
}
