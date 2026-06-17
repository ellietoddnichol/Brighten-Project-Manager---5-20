# Production API smoke test - Brighten PM
# Usage: .\scripts\production-smoke.ps1 [-BaseUrl <url>]
param(
  [string]$BaseUrl = "https://projectmanager06-zzehjpfjea-ew.a.run.app"
)

$ErrorActionPreference = "Stop"
$endpoints = @(
  @{ Path = "/api/health"; ExpectOk = $true },
  @{ Path = "/api/projects"; ExpectOk = $true; MinCount = 1 },
  @{ Path = "/api/action-center"; ExpectOk = $true },
  @{ Path = "/api/backend-readiness"; ExpectOk = $true },
  @{ Path = "/api/projects/158/tasks"; ExpectOk = $true },
  @{ Path = "/api/projects/158/documents"; ExpectOk = $true }
)

Write-Host "Brighten PM production smoke - $BaseUrl"
$failures = 0

foreach ($ep in $endpoints) {
  $url = "$BaseUrl$($ep.Path)"
  try {
    $resp = Invoke-RestMethod -Uri $url -TimeoutSec 20
    $ok = [bool]$resp.ok
    $count = $null
    if ($null -ne $resp.count) { $count = $resp.count }
    if ((-not $ok) -and $ep.ExpectOk) {
      Write-Host "FAIL $($ep.Path) - ok=false" -ForegroundColor Red
      $failures++
      continue
    }
    if (($null -ne $ep.MinCount) -and ($count -lt $ep.MinCount)) {
      Write-Host "FAIL $($ep.Path) - count=$count (expected >= $($ep.MinCount))" -ForegroundColor Red
      $failures++
      continue
    }
    $countLabel = ""
    if ($null -ne $count) { $countLabel = " count=$count" }
    Write-Host "OK   $($ep.Path)$countLabel" -ForegroundColor Green
  }
  catch {
    Write-Host "FAIL $($ep.Path) - $($_.Exception.Message)" -ForegroundColor Red
    $failures++
  }
}

Write-Host ""
if ($failures -gt 0) {
  Write-Host "$failures endpoint(s) failed." -ForegroundColor Red
  exit 1
}

Write-Host "All API smoke checks passed."
Write-Host ""
Write-Host "Manual steps (Phase 0):"
Write-Host "  1. Firebase Console - Authentication - Settings - Authorized domains"
Write-Host "     Add: projectmanager06-zzehjpfjea-ew.a.run.app"
Write-Host "  2. firebase login --reauth; firebase deploy --only firestore:rules"
Write-Host "  3. Sign in on the live URL and run route checklist in docs/deploy-readiness-checklist.md"
