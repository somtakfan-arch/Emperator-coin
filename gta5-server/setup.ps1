<#
    FiveM sandbox server - setup in one run.
    Downloads FXServer, cfx-server-data and vMenu, writes a working server.cfg,
    wires up any add-on car packs and creates start.bat.

    Usage (PowerShell, no admin rights needed):
        .\setup.ps1
        .\setup.ps1 -Root "D:\FXServer" -Hostname "Emperator crew" -MaxClients 16
        .\setup.ps1 -SyncCarsOnly          # re-scan car packs after adding new ones
#>

[CmdletBinding()]
param(
    [string] $Root        = "C:\FXServer",
    [string] $LicenseKey  = "",
    [string] $Hostname    = "Emperator crew",
    [int]    $MaxClients  = 16,
    [switch] $SkipCars,
    [switch] $SyncCarsOnly
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Pinned fallback: latest recommended Windows build as of 2026-09.
$FallbackArtifact = 'https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/35245-6efb47dff473c0e2a12fb50b08d74c0eb24a50d5/server.7z'
$VersionsApi      = 'https://changelogs-live.fivem.net/api/changelog/versions/win32/server'
$ServerDataZip    = 'https://github.com/citizenfx/cfx-server-data/archive/refs/heads/master.zip'
$VMenuApi         = 'https://api.github.com/repos/TomGrobbe/vMenu/releases/latest'
$CarPackZip       = 'https://github.com/Rymex47/free-modpack/archive/refs/heads/main.zip'
$SevenZipStandalone = 'https://www.7-zip.org/a/7zr.exe'

$ServerDir = Join-Path $Root 'server'
$DataDir   = Join-Path $Root 'server-data'
$TmpDir    = Join-Path $Root 'tmp'
$ResDir    = Join-Path $DataDir 'resources'
$CarsDir   = Join-Path $ResDir '[cars]'

function Write-Step { param([string]$Text) Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Text) Write-Host "    OK  $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "    !   $Text" -ForegroundColor Yellow }

function Get-File {
    param([string]$Url, [string]$OutFile)
    $name = Split-Path $OutFile -Leaf
    Write-Host "    downloading $name ..." -NoNewline
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add('User-Agent', 'fivem-setup-script')
    try   { $wc.DownloadFile($Url, $OutFile) }
    finally { $wc.Dispose() }
    $mb = [math]::Round((Get-Item -LiteralPath $OutFile).Length / 1MB, 1)
    Write-Host " done ($mb MB)" -ForegroundColor Green
}

function Resolve-SevenZip {
    foreach ($candidate in @(
        "$env:ProgramFiles\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
    )) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $cmd = Get-Command 7z.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $local = Join-Path $TmpDir '7zr.exe'
    if (-not (Test-Path -LiteralPath $local)) {
        Write-Warn '7-Zip not found, grabbing the standalone extractor'
        Get-File -Url $SevenZipStandalone -OutFile $local
    }
    return $local
}

function Get-ArtifactUrl {
    try {
        $info = Invoke-RestMethod -Uri $VersionsApi -UseBasicParsing -TimeoutSec 20
        foreach ($field in @('recommended_download', 'optional_download', 'latest_download')) {
            if ($info.$field) {
                Write-Ok "build $($info.recommended) (recommended)"
                return $info.$field
            }
        }
    } catch {
        Write-Warn "version API unreachable ($($_.Exception.Message)), using the pinned build"
    }
    return $FallbackArtifact
}

# Returns every folder that holds an fxmanifest.lua / __resource.lua, deepest first.
function Find-ResourceFolders {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    Get-ChildItem -LiteralPath $Path -Recurse -File -Force |
        Where-Object { $_.Name -in @('fxmanifest.lua', '__resource.lua') } |
        ForEach-Object { $_.Directory } |
        Sort-Object -Property FullName -Unique
}

# Car packs ship in every layout imaginable. Flatten them so that every resource
# sits directly in resources\[cars]\<name> - that is the only depth FiveM scans.
function Invoke-CarSync {
    if (-not (Test-Path -LiteralPath $CarsDir)) {
        [void][System.IO.Directory]::CreateDirectory($CarsDir)
    }

    $resources = @(Find-ResourceFolders -Path $CarsDir)
    foreach ($res in $resources) {
        $parent = $res.Parent
        if ($null -ne $parent -and $parent.FullName -ne (Get-Item -LiteralPath $CarsDir).FullName) {
            $target = Join-Path $CarsDir $res.Name
            if (-not (Test-Path -LiteralPath $target)) {
                Move-Item -LiteralPath $res.FullName -Destination $target -Force
            }
        }
    }

    # Drop whatever empty scaffolding the packs left behind.
    for ($i = 0; $i -lt 6; $i++) {
        Get-ChildItem -LiteralPath $CarsDir -Recurse -Directory -Force |
            Sort-Object { $_.FullName.Length } -Descending |
            Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force) } |
            ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
    }

    $resources = @(Find-ResourceFolders -Path $CarsDir)
    Write-Ok "car resources found: $($resources.Count)"

    # Spawn names live in the vehicles*.meta files as <modelName>foo</modelName>.
    $models = New-Object System.Collections.Generic.List[string]
    foreach ($res in $resources) {
        Get-ChildItem -LiteralPath $res.FullName -Recurse -File -Force |
            Where-Object { $_.Name -like '*vehicles*.meta' } |
            ForEach-Object {
                $text = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
                if ($text) {
                    foreach ($m in [regex]::Matches($text, '<modelName>\s*([A-Za-z0-9_\-]+)\s*</modelName>')) {
                        $models.Add($m.Groups[1].Value.ToLowerInvariant())
                    }
                }
            }
    }
    $models = @($models | Sort-Object -Unique)
    Write-Ok "spawn names found: $($models.Count)"

    # vMenu only lists add-on vehicles that are named in its addons.json.
    $addonsPath = Join-Path $ResDir 'vMenu\config\addons.json'
    if (Test-Path -LiteralPath $addonsPath) {
        # Built by hand: ConvertTo-Json collapses a one-element array into a bare
        # string on PS 5.1, and vMenu then refuses to read the file.
        $quoted = ($models | ForEach-Object { '    "' + $_ + '"' }) -join ",`r`n"
        $json = "{`r`n  `"vehicles`": [`r`n$quoted`r`n  ],`r`n  `"peds`": [],`r`n  `"weapons`": []`r`n}"
        $json | Set-Content -LiteralPath $addonsPath -Encoding UTF8
        Write-Ok "vMenu addons.json updated"
    } else {
        Write-Warn "vMenu addons.json not found, skipped"
    }

    if ($models.Count -gt 0) {
        $listPath = Join-Path $Root 'spawn-names.txt'
        $models | Set-Content -LiteralPath $listPath -Encoding UTF8
        Write-Ok "spawn name list: $listPath"
    }
}

# --------------------------------------------------------------------------

if ($SyncCarsOnly) {
    Write-Step 'Re-scanning car packs'
    Invoke-CarSync
    Write-Host "`nDone. Restart the server to pick the changes up.`n" -ForegroundColor Green
    return
}

Write-Step "Preparing $Root"
foreach ($dir in @($Root, $ServerDir, $DataDir, $TmpDir)) {
    [void][System.IO.Directory]::CreateDirectory($dir)
}
Write-Ok 'folders ready'

$sevenZip = Resolve-SevenZip

Write-Step 'FXServer artifact'
$artifactUrl = Get-ArtifactUrl
$artifact    = Join-Path $TmpDir 'server.7z'
Get-File -Url $artifactUrl -OutFile $artifact
& $sevenZip x $artifact "-o$ServerDir" -y | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $ServerDir 'FXServer.exe'))) {
    throw "FXServer.exe missing after extraction - check $ServerDir"
}
Write-Ok 'FXServer unpacked'

Write-Step 'Base resources (cfx-server-data)'
$dataZip = Join-Path $TmpDir 'server-data.zip'
Get-File -Url $ServerDataZip -OutFile $dataZip
$dataTmp = Join-Path $TmpDir 'server-data-extract'
if (Test-Path -LiteralPath $dataTmp) { Remove-Item -LiteralPath $dataTmp -Recurse -Force }
Expand-Archive -LiteralPath $dataZip -DestinationPath $dataTmp -Force
$inner = Get-ChildItem -LiteralPath $dataTmp -Directory | Select-Object -First 1
Get-ChildItem -LiteralPath $inner.FullName -Force | ForEach-Object {
    $dest = Join-Path $DataDir $_.Name
    if (-not (Test-Path -LiteralPath $dest)) {
        Move-Item -LiteralPath $_.FullName -Destination $dest -Force
    }
}
Write-Ok 'base resources in place'

Write-Step 'vMenu'
try {
    $release = Invoke-RestMethod -Uri $VMenuApi -UseBasicParsing -TimeoutSec 20 -Headers @{ 'User-Agent' = 'fivem-setup-script' }
    $asset   = $release.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1
    if (-not $asset) { throw 'no .zip asset in the latest release' }

    $vmenuZip = Join-Path $TmpDir 'vmenu.zip'
    Get-File -Url $asset.browser_download_url -OutFile $vmenuZip
    $vmenuTmp = Join-Path $TmpDir 'vmenu-extract'
    if (Test-Path -LiteralPath $vmenuTmp) { Remove-Item -LiteralPath $vmenuTmp -Recurse -Force }
    Expand-Archive -LiteralPath $vmenuZip -DestinationPath $vmenuTmp -Force

    $vmenuSrc = Find-ResourceFolders -Path $vmenuTmp | Select-Object -First 1
    if (-not $vmenuSrc) { throw 'no fxmanifest.lua inside the vMenu archive' }

    $vmenuDest = Join-Path $ResDir 'vMenu'
    if (Test-Path -LiteralPath $vmenuDest) { Remove-Item -LiteralPath $vmenuDest -Recurse -Force }
    Move-Item -LiteralPath $vmenuSrc.FullName -Destination $vmenuDest -Force
    Write-Ok "vMenu $($release.tag_name) installed"
} catch {
    Write-Warn "vMenu install failed: $($_.Exception.Message)"
    Write-Warn 'Grab it by hand from https://github.com/TomGrobbe/vMenu/releases'
}

if (-not $SkipCars) {
    Write-Step 'Car pack'
    try {
        $carZip = Join-Path $TmpDir 'cars.zip'
        Get-File -Url $CarPackZip -OutFile $carZip
        $carTmp = Join-Path $TmpDir 'cars-extract'
        if (Test-Path -LiteralPath $carTmp) { Remove-Item -LiteralPath $carTmp -Recurse -Force }
        Expand-Archive -LiteralPath $carZip -DestinationPath $carTmp -Force
        [void][System.IO.Directory]::CreateDirectory($CarsDir)
        Get-ChildItem -LiteralPath $carTmp -Directory | ForEach-Object {
            Get-ChildItem -LiteralPath $_.FullName -Force | ForEach-Object {
                $dest = Join-Path $CarsDir $_.Name
                if (-not (Test-Path -LiteralPath $dest)) {
                    Move-Item -LiteralPath $_.FullName -Destination $dest -Force
                }
            }
        }
        Write-Ok 'car pack downloaded'
    } catch {
        Write-Warn "car pack failed: $($_.Exception.Message)"
    }
}

Write-Step 'Wiring up cars'
Invoke-CarSync

Write-Step 'server.cfg'
if ([string]::IsNullOrWhiteSpace($LicenseKey)) {
    Write-Host '    Paste the key from https://keymaster.fivem.net (server type: Development).'
    $LicenseKey = (Read-Host '    License key').Trim()
}
if ([string]::IsNullOrWhiteSpace($LicenseKey)) {
    Write-Warn 'no key entered - server.cfg gets a placeholder, fill it in before starting'
    $LicenseKey = 'PASTE_YOUR_KEY_HERE'
}

$carEnsure = ''
foreach ($res in @(Find-ResourceFolders -Path $CarsDir)) {
    $carEnsure += "ensure $($res.Name)`r`n"
}
if ([string]::IsNullOrWhiteSpace($carEnsure)) {
    $carEnsure = "# no car resources yet - drop packs into resources\[cars] and rerun with -SyncCarsOnly`r`n"
}

$cfg = @"
## ------------------------------------------------------------------
## FiveM sandbox server - generated by setup.ps1
## ------------------------------------------------------------------

endpoint_add_tcp "0.0.0.0:30120"
endpoint_add_udp "0.0.0.0:30120"

sv_licenseKey "$LicenseKey"
sv_hostname "$Hostname"
sv_maxclients $MaxClients
sv_scriptHookAllowed 0
sets locale "ru-RU"

# Uncomment and bump if newer DLC vehicles refuse to spawn.
#set sv_enforceGameBuild 3407

## --- base resources -----------------------------------------------
ensure mapmanager
ensure chat
ensure spawnmanager
ensure sessionmanager
ensure basic-gamemode
ensure hardcap

## --- vMenu --------------------------------------------------------
ensure vMenu

# Friends-only sandbox: everyone gets the whole menu.
# To lock it down later, drop this line and hand out permissions per player instead.
add_ace builtin.everyone "vMenu.Everything" allow

# Make yourself an admin (find your identifier in the server console on join):
#add_principal identifier.fivem:1234567 group.admin
#add_ace group.admin command allow

## --- add-on cars --------------------------------------------------
$carEnsure
"@

$cfgPath = Join-Path $DataDir 'server.cfg'
$cfg | Set-Content -LiteralPath $cfgPath -Encoding UTF8
Write-Ok "written: $cfgPath"

Write-Step 'start.bat'
$bat = @"
@echo off
title FiveM server
cd /d "%~dp0"
"$ServerDir\FXServer.exe" +exec server.cfg
pause
"@
$batPath = Join-Path $DataDir 'start.bat'
$bat | Set-Content -LiteralPath $batPath -Encoding ASCII
Write-Ok "written: $batPath"

Remove-Item -LiteralPath $TmpDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host @"

=====================================================================
 Ready.

 1. Start the server:   $batPath
 2. In FiveM press F8 and type:   connect 127.0.0.1
 3. Friends connect to your Radmin VPN / external IP on port 30120.
 4. In game press M -> Vehicle Spawner -> Addon Vehicles.

 Added more car packs? Drop them in $CarsDir and run:
     .\setup.ps1 -SyncCarsOnly
=====================================================================

"@ -ForegroundColor Green
