$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Assert-ExitCode {
    if ($LASTEXITCODE -ne 0) { throw "Environment check failed: exit code $LASTEXITCODE" }
}
Push-Location (Join-Path $projectRoot 'backend')
try {
    uv run --locked python ../scripts/check_backend.py
    Assert-ExitCode
} finally { Pop-Location }
Push-Location (Join-Path $projectRoot 'client')
try {
    pnpm.cmd exec tsc --version
    Assert-ExitCode
    pnpm.cmd exec vite --version
    Assert-ExitCode
    node check-environment.mjs
    Assert-ExitCode
    $previousElectronMode = $env:ELECTRON_RUN_AS_NODE
    try {
        Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
        pnpm.cmd exec electron check-electron.cjs
        Assert-ExitCode
    } finally {
        if ($null -ne $previousElectronMode) { $env:ELECTRON_RUN_AS_NODE = $previousElectronMode }
    }
} finally { Pop-Location }
