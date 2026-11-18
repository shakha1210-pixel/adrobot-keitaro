# Windows: создаёт venv, ставит зависимости, применяет миграции, запускает сервер.
# Использование:  .\scripts\dev.ps1
param([switch]$SkipInstall)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

if (-not $SkipInstall) {
    & .\.venv\Scripts\python.exe -m pip install --upgrade pip
    & .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Создан .env из .env.example — впишите KEITARO_API_KEY!" -ForegroundColor Yellow
}

& .\.venv\Scripts\python.exe -m alembic upgrade head
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
