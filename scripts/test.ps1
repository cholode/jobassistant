$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Checks failed: $LASTEXITCODE" } }
Push-Location (Join-Path $projectRoot 'backend')
try {
    uv run --locked ruff check app tests
    Check-Exit
    uv run --locked pytest -q
    Check-Exit
} finally { Pop-Location }
Push-Location (Join-Path $projectRoot 'client')
try {
    pnpm.cmd run lint
    Check-Exit
    pnpm.cmd run build
    Check-Exit
    pnpm.cmd run test:desktop
    Check-Exit
} finally { Pop-Location }
