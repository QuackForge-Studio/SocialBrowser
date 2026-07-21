$global:exitCode = 0

function Run-Tests {
    param([string]$Label, [string]$Config)
    Write-Host "=== $Label ===" -ForegroundColor Cyan
    & "vitest" run "--config" $Config
    if ($LASTEXITCODE -ne 0) {
        $global:exitCode = 1
        Write-Host "FAILED: $Label" -ForegroundColor Red
    } else {
        Write-Host "PASSED: $Label" -ForegroundColor Green
    }
    Write-Host ""
}

Run-Tests -Label "Main Package Tests" -Config "packages/main/vitest.config.ts"
Run-Tests -Label "Worker Package Tests" -Config "packages/worker/vitest.config.ts"
Run-Tests -Label "Dashboard Package Tests" -Config "packages/dashboard/vitest.config.ts"

exit $global:exitCode
