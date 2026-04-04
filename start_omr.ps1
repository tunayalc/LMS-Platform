$env:LMS_ENV_FILE = '.env.local'
Set-Location $PSScriptRoot\services\omr-python
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 3002
