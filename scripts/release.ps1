param([string]$Version = '0.0.1')
# 指定发布目录和产物版本；编译前需已安装开发依赖及 PyInstaller。
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be x.y.z' }
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build failed: $LASTEXITCODE" } }
Push-Location $projectRoot
try {
    # 先打包 Python 运行环境与模拟站资源，再由 electron-builder 一起装入 EXE。
    & ./backend/.venv/Scripts/python.exe -m PyInstaller --noconfirm --clean --onedir --name job-agent-backend --distpath build/backend --workpath build/pyinstaller --specpath build --paths backend --add-data "${projectRoot}/mock-site:mock-site" --collect-submodules uvicorn backend/desktop_entry.py
    Check-Exit
    Push-Location client
    try {
        # 编译前端及 Electron 主进程，任一步失败都会停止后续打包。
        pnpm.cmd run build
        Check-Exit
        pnpm.cmd exec electron-builder --win portable --x64 --config electron-builder.json "--config.extraMetadata.version=$Version" "--config.directories.output=../release/v$Version" --publish never
        Check-Exit
    } finally { Pop-Location }
    # 输出校验值，方便核对分发后的安装包是否一致。
    Get-FileHash "release/v$Version/Job-Agent-$Version-win-x64.exe" -Algorithm SHA256 | Format-List
} finally { Pop-Location }
