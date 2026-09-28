param([switch]$Built)
# 默认使用 Vite 开发服务器；传入 -Built 时加载编译后的静态页面。
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendProcess = $null
$viteProcess = $null
$oldToken = $env:JOB_AGENT_TOKEN
$oldDevUrl = $env:JOB_AGENT_DEV_URL
$oldElectronMode = $env:ELECTRON_RUN_AS_NODE
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'logs') | Out-Null
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed: $LASTEXITCODE" } }
function Wait-Http($url, $process) {
    # 等待服务真正可用，而不是仅凭进程已启动就继续。
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($process.HasExited) { throw "Service exited. See logs/." }
        try { $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if ($response.StatusCode -eq 200) { return } } catch {}
        Start-Sleep -Milliseconds 500
    }
    throw "Service did not become ready: $url"
}
try {
    # 开发模式使用固定端口，已被占用时停止，避免连接到另一实例。
    foreach ($port in @(8765, 5173)) {
        if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is occupied. Close the previous preview first." }
    }
    # 每次开发会话生成临时令牌，通过环境变量共享给桌面端和后端。
    $env:JOB_AGENT_TOKEN = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Push-Location (Join-Path $projectRoot 'client')
    try { pnpm.cmd run build; Check-Exit } finally { Pop-Location }
    $python = Join-Path $projectRoot 'backend/.venv/Scripts/python.exe'
    $backendProcess = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:create_app','--factory','--host','127.0.0.1','--port','8765') -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'logs/backend.log') -RedirectStandardError (Join-Path $projectRoot 'logs/backend-error.log')
    Wait-Http 'http://127.0.0.1:8765/health' $backendProcess
    if (-not $Built) {
        $vite = Join-Path $projectRoot 'client/node_modules/vite/bin/vite.js'
        $viteProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @("`"$vite`"", '--host','127.0.0.1') -WorkingDirectory (Join-Path $projectRoot 'client') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'logs/vite.log') -RedirectStandardError (Join-Path $projectRoot 'logs/vite-error.log')
        Wait-Http 'http://127.0.0.1:5173' $viteProcess
        $env:JOB_AGENT_DEV_URL = 'http://127.0.0.1:5173'
    } else { Remove-Item Env:JOB_AGENT_DEV_URL -ErrorAction SilentlyContinue }
    Push-Location (Join-Path $projectRoot 'client')
    try { pnpm.cmd exec electron .; Check-Exit } finally { Pop-Location }
# 无论正常退出还是启动失败，都清理本次启动的服务并恢复原环境变量。
} finally {
    if ($viteProcess -and -not $viteProcess.HasExited) { Stop-Process -Id $viteProcess.Id -ErrorAction SilentlyContinue }
    if ($backendProcess -and -not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue }
    $env:JOB_AGENT_TOKEN = $oldToken
    $env:JOB_AGENT_DEV_URL = $oldDevUrl
    $env:ELECTRON_RUN_AS_NODE = $oldElectronMode
}
