$ErrorActionPreference = "Stop"

# Enforce TLS 1.2 for GitHub API compatibility in older PowerShell (e.g. 5.1)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Helpers
function Write-Log {
    param([string]$Message)
    Write-Host "=> $Message"
}

function Abort {
    param([string]$Message)
    throw $Message
}

function Get-DaybookArchitecture {
    $Arch = $env:PROCESSOR_ARCHITEW6432
    if (-not $Arch) {
        $Arch = $env:PROCESSOR_ARCHITECTURE
    }
    
    if (-not $Arch) {
        throw "Unable to determine Windows architecture.`r`nPROCESSOR_ARCHITECTURE=$env:PROCESSOR_ARCHITECTURE`r`nPROCESSOR_ARCHITEW6432=$env:PROCESSOR_ARCHITEW6432"
    }

    switch ($Arch.ToUpperInvariant()) {
        "AMD64" { return "amd64" }
        "ARM64" { return "arm64" }
        default { throw "Unsupported Windows architecture: $Arch" }
    }
}

# 1. Detect OS & Architecture
$ArchName = Get-DaybookArchitecture
$Platform = "windows_$ArchName"
Write-Log "Detected platform: $Platform"

# Default install directory
$InstallDir = if ($env:DAYBOOK_INSTALL_DIR) { $env:DAYBOOK_INSTALL_DIR } else { "$env:LOCALAPPDATA\Programs\Daybook\bin" }

# 2. Get latest release tag
Write-Log "Fetching latest release info..."
$Repo = "StatIndet/daybook"
$ApiUrl = "https://api.github.com/repos/$Repo/releases/latest"

try {
    $Release = Invoke-RestMethod -Uri $ApiUrl -ErrorAction Stop
} catch {
    Abort "Failed to query latest release. Error: $_"
}

$LatestTag = $Release.tag_name
if (-not $LatestTag) {
    Abort "Failed to determine the latest release tag from GitHub API."
}
Write-Log "Latest release is $LatestTag"

# 3. Construct file names
$DownloadUrlBase = "https://github.com/$Repo/releases/download"
$AssetName = "daybook_${LatestTag}_${Platform}.zip"
$AssetUrl = "$DownloadUrlBase/$LatestTag/$AssetName"
$ChecksumsUrl = "$DownloadUrlBase/$LatestTag/checksums.txt"

# 4. Create temp dir and download
$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "daybook_install_$([Guid]::NewGuid().ToString().Substring(0,8))"
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

try {
    $ZipPath = Join-Path $TmpDir $AssetName
    $ChecksumsPath = Join-Path $TmpDir "checksums.txt"

    Write-Log "Downloading $AssetName..."
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $AssetUrl -OutFile $ZipPath -ErrorAction Stop
    } catch {
        Abort "Failed to download archive. Error: $_"
    }

    Write-Log "Downloading checksums.txt..."
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $ChecksumsUrl -OutFile $ChecksumsPath -ErrorAction Stop
    } catch {
        Abort "Failed to download checksums.txt. Error: $_"
    }

    # 5. Verify checksum
    Write-Log "Verifying checksum..."
    $Checksums = Get-Content $ChecksumsPath -ErrorAction Stop
    $ExpectedHash = ""
    foreach ($Line in $Checksums) {
        if ($Line -match [regex]::Escape($AssetName)) {
            $ExpectedHash = ($Line -split '\s+')[0]
            break
        }
    }

    if (-not $ExpectedHash) {
        Abort "Checksum entry not found for $AssetName in checksums.txt"
    }

    $ActualHash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash
    if ($ExpectedHash.ToUpper() -ne $ActualHash.ToUpper()) {
        Abort "Checksum verification failed! Expected: $ExpectedHash, Actual: $ActualHash"
    }
    Write-Log "Checksum verified successfully."

    # 6. Extract
    Write-Log "Extracting archive..."
    try {
        Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force -ErrorAction Stop
    } catch {
        Abort "Failed to extract archive."
    }

    $ExtractedExe = Join-Path $TmpDir "daybook.exe"
    if (-not (Test-Path $ExtractedExe)) {
        Abort "Failed to extract archive. daybook.exe not found."
    }

    # 7. Install
    Write-Log "Installing daybook.exe to $InstallDir..."
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    }
    try {
        Copy-Item -Path $ExtractedExe -Destination (Join-Path $InstallDir "daybook.exe") -Force -ErrorAction Stop
    } catch {
        Abort "Failed to install executable."
    }

    # 8. Verify installation
    Write-Log "Verifying installation..."
    $InstalledExe = Join-Path $InstallDir "daybook.exe"
    & $InstalledExe --version
    if ($LASTEXITCODE -ne 0) {
        Abort "Installed executable failed verification."
    }

    Write-Host "`nDaybook $LatestTag installed successfully."
    Write-Host "Installed to: $InstalledExe"

    # 9. PATH Check
    $UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($UserPath -eq $null) {
        $UserPath = ""
    }
    $PathArray = $UserPath -split ";" | Where-Object { $_ -ne "" }
    $NormalizedInstallDir = $InstallDir.TrimEnd('\')
    
    $InPath = $false
    foreach ($P in $PathArray) {
        if ($P.TrimEnd('\').Equals($NormalizedInstallDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            $InPath = $true
            break
        }
    }

    if (-not $InPath) {
        $NewPath = $UserPath
        if ($NewPath -and -not $NewPath.EndsWith(";")) {
            $NewPath += ";"
        }
        $NewPath += $NormalizedInstallDir
        [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
        
        # Update current session PATH
        $env:Path += ";$NormalizedInstallDir"
        
        Write-Host "`nAdded $InstallDir to your User PATH."
    }

} finally {
    if (Test-Path $TmpDir) {
        Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
