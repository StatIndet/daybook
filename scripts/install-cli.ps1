$ErrorActionPreference = "Stop"

Write-Host "=> Building frontend assets..."
npm ci
npm run build:js
npm run build:vendor

# Determine installation path
$InstallBin = $env:GOBIN
if (-not $InstallBin) {
    $GoPath = (go env GOPATH).Trim()
    $InstallBin = Join-Path $GoPath "bin"
}

Write-Host "=> Installing daybook CLI to $InstallBin..."
go install ./cmd/daybook

Write-Host "=> Install successful."
Write-Host "=> Executable is located at: $(Join-Path $InstallBin 'daybook.exe')"

# Check if INSTALL_BIN is in PATH
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -eq $null) {
    $UserPath = ""
}
$PathArray = $UserPath -split ";" | Where-Object { $_ -ne "" }
$NormalizedInstallBin = $InstallBin.TrimEnd('\')

$InPath = $false
foreach ($P in $PathArray) {
    if ($P.TrimEnd('\').Equals($NormalizedInstallBin, [System.StringComparison]::OrdinalIgnoreCase)) {
        $InPath = $true
        break
    }
}

if (-not $InPath) {
    Write-Host "`nWarning: $InstallBin is not in your PATH."
    Write-Host "You may need to add it manually to your environment variables."
}
