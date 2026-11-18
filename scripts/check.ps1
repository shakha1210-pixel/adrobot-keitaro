# Windows: полная проверка перед коммитом — линт, формат-чек, тесты, фронтенд.
# Использование:  .\scripts\check.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$python = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }

Write-Host "== ruff check ==" -ForegroundColor Cyan
& $python -m ruff check .
Write-Host "== ruff format --check ==" -ForegroundColor Cyan
& $python -m ruff format --check .
Write-Host "== pytest ==" -ForegroundColor Cyan
& $python -m pytest
Write-Host "== frontend syntax ==" -ForegroundColor Cyan
node --check static/app.js
Write-Host "== done ==" -ForegroundColor Green
