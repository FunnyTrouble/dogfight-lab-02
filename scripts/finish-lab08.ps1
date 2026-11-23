param([switch]$Publish)
$ErrorActionPreference = 'Stop'
function Run([string]$command) { Write-Host "`n>>> $command" -ForegroundColor Cyan; cmd /c $command; if ($LASTEXITCODE -ne 0) { throw "Failed: $command" } }
Run 'npm install'
Run 'npm run typecheck'
Run 'npm run lint'
Run 'npm test'
Run 'npm run test:coverage'
Run 'npm run build:production'
Run 'npm run test:production'
Run 'npx playwright install chromium'
Run 'npm run test:e2e'
# The new dependencies will update package-lock.json during npm install.
Write-Host 'Node checks passed. Docker size, docker stop, public WSS and remote RTT are separate deployment checks.' -ForegroundColor Yellow
if (Get-Command docker -ErrorAction SilentlyContinue) {
  Run 'docker compose build'
  Run 'docker image inspect dogfight:lab-08 --format "{{.Size}}"'
} else { Write-Host 'Docker not installed; Docker checks not performed.' -ForegroundColor Yellow }
if (-not $Publish) { Write-Host 'Done. Add -Publish only when ready to push lab-08.'; exit 0 }
$source = (Get-Location).Path
$target = Join-Path (Split-Path $source -Parent) 'lab-08-github'
if (Test-Path $target) { throw 'lab-08-github already exists; stopping to avoid overwriting work.' }
Run "git clone --branch lab-07 https://github.com/FunnyTrouble/dogfight-lab-02.git `"$target`""
Set-Location $target
Run 'git switch -c lab-08'
& robocopy $source $target /MIR /XD .git node_modules dist coverage test-results playwright-report logs /XF '*.zip' | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Robocopy failed' }
Run 'git add -A'
Run 'git commit -m "Complete Lab 8"'
Run 'git tag lab-08'
Run 'git push -u origin refs/heads/lab-08:refs/heads/lab-08'
Run 'git push origin refs/tags/lab-08:refs/tags/lab-08'
Run 'git status'
Write-Host 'lab-08 pushed. Do NOT create v1.0.0 until actual public deployment is tested.' -ForegroundColor Green
