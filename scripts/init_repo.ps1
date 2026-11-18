# Windows PowerShell: git init + birinchi commit / первый коммит
# Ishlatish / Запуск:  .\scripts\init_repo.ps1
param([string]$GitDir = "E:\Other Apps\Git")
$git = Join-Path $GitDir "cmd\git.exe"
if (-not (Test-Path $git)) { $git = "git" }
& $git init -b main
& $git add .
& $git commit -m "chore: initial architecture and docs"
Write-Host "Keyingi qadam / Дальше: git remote add origin <URL>; git push -u origin main"
