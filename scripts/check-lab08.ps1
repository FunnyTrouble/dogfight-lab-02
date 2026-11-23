$ErrorActionPreference='Stop'
function Run([string]$cmd) { Write-Host "`n>>> $cmd" -ForegroundColor Cyan; cmd /c $cmd; if ($LASTEXITCODE -ne 0) { throw "Failed: $cmd" } }
Run 'npm install'
Run 'npm run typecheck'
Run 'npm run lint'
Run 'npm test'
Run 'npm run test:coverage'
Run 'npm run build:production'
Run 'npx playwright install chromium'
Run 'npm run test:e2e'
Write-Host "Local checks passed. Docker and public deployment must still be checked separately." -ForegroundColor Green
