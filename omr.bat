@echo off
chcp 65001 >nul
title LMS Python OMR

:: OMR dizinine TAM YOL ile git
cd /d "C:\Users\ytuna\OneDrive\Masaüstü\final projesi\services\omr-python" || (
    echo HATA: Klasor bulunamadi!
    echo Yol: C:\Users\ytuna\OneDrive\Masaüstü\final projesi\services\omr-python
    pause
    exit /b
)

:: Environment Variable (Dosya yolu ile)
set LMS_ENV_FILE=..\..\.env.local

echo OMR Servisi Baslatiliyor...
echo Calisma Dizini: %CD%

:: Virtual Environment Python ile başlat
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 3002
) else (
    echo HATA: .venv bulunamadi!
    python -m uvicorn app.main:app --host 0.0.0.0 --port 3002
)

pause
