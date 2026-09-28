param([string]$Version = '0.0.1')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be x.y.z' }
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build failed: $LASTEXITCODE" } }
Push-Location $projectRoot
try {
    & ./backend/.venv/Scripts/python.exe -m PyInstaller --noconfirm --clean --onedir --name job-agent-backend --distpath build/backend --workpath build/pyinstaller --specpath build --paths backend --add-data "${projectRoot}/mock-site:mock-site" --collect-submodules uvicorn backend/desktop_entry.py
    Check-Exit
    Push-Location client
    try {
        pnpm.cmd run build
        Check-Exit
        pnpm.cmd exec electron-builder --win portable --x64 --config electron-builder.json "--config.extraMetadata.version=$Version" "--config.directories.output=../release/v$Version" --publish never
        Check-Exit
    } finally { Pop-Location }
    Get-FileHash "release/v$Version/Job-Agent-$Version-win-x64.exe" -Algorithm SHA256 | Format-List
} finally { Pop-Location }
