param([switch]$Publish)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
function Run([string]$program, [string[]]$arguments) {
    Write-Host "`n>>> $program $($arguments -join ' ')" -ForegroundColor Cyan
    & $program @arguments
    if ($LASTEXITCODE -ne 0) { throw "Failed: $program $($arguments -join ' ')" }
}
Run 'npm' @('install')
Run 'npm' @('run','typecheck')
Run 'npm' @('run','lint')
Run 'npm' @('test')
Run 'npm' @('run','test:coverage')
Run 'npm' @('run','build')
Run 'npx' @('playwright','install','chromium')
Run 'npm' @('run','test:e2e')
Run 'npm' @('run','bench:simulation')
Write-Host "`nLocal checks completed. Chrome GC/flame chart still needs a real 30-second recording." -ForegroundColor Green
if (!$Publish) { return }
$target = Join-Path (Split-Path $root -Parent) 'lab-07-github'
if (Test-Path $target) { throw 'lab-07-github already exists. Keeping it untouched.' }
$repo = 'https://github.com/FunnyTrouble/dogfight-lab-02.git'
Run 'git' @('clone','--branch','lab-06',$repo,$target)
Set-Location $target
Run 'git' @('switch','-c','lab-07')
& robocopy $root $target /MIR /XD '.git' 'node_modules' 'dist' 'logs' 'coverage' 'test-results' 'playwright-report' /XF '*.zip'
if ($LASTEXITCODE -ge 8) { throw 'File copy failed' }
Run 'git' @('add','-A')
Run 'git' @('commit','-m','Complete Lab 7')
Run 'git' @('tag','lab-07')
Run 'git' @('push','-u','origin','refs/heads/lab-07:refs/heads/lab-07')
Run 'git' @('push','origin','refs/tags/lab-07:refs/tags/lab-07')
Run 'git' @('status')
Write-Host 'Lab 07 branch and tag were pushed.' -ForegroundColor Green
