# Clone and install claude-code-zh-cn
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Administrator\Desktop"

Write-Host "=== Cloning claude-code-zh-cn ==="
if (Test-Path "claude-code-zh-cn") {
    Remove-Item -Recurse -Force "claude-code-zh-cn"
}
git clone https://github.com/taekchef/claude-code-zh-cn.git
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git clone failed with exit code $LASTEXITCODE"
    exit 1
}

Set-Location claude-code-zh-cn
Write-Host "=== Running install.ps1 ==="
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: install.ps1 failed with exit code $LASTEXITCODE"
    exit 1
}

Write-Host "=== Done! ==="
