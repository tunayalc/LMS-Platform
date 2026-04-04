@echo off
chcp 65001 > nul
title LMS Project Starter

echo ============================================
echo   LMS PROJECT - PostgreSQL Mode
echo ============================================
echo.

REM Set PostgreSQL Database Mode
set LMS_DB_MODE=postgres
set LMS_DB_URL=postgresql://postgres:postgres@localhost:5432/lms

echo [INFO] Database Mode: %LMS_DB_MODE%
echo [INFO] Database URL: postgresql://postgres:***@localhost:5432/lms
echo.

REM Navigate to project directory
cd /d "%~dp0"

echo [1/3] Starting API Server...
start "LMS API" cmd /k "cd apps\api && npm run dev"

timeout /t 5 /nobreak > nul

echo [2/3] Starting Web Server...
start "LMS Web" cmd /k "cd apps\web && npm run dev"

echo.
echo ============================================
echo   LMS STARTED SUCCESSFULLY!
echo ============================================
echo.
echo   API: http://localhost:4000
echo   Web: http://localhost:3000
echo.
echo   Admin Login:
echo   Username: admin
echo   Password: Test123!
echo.
echo ============================================
pause
