# package.ps1 - build a handoff zip WITHOUT secrets (GATE-2026-10-06 B2 / audit security #2).
#
# A plain zip of this folder ships n8n/.env, n8n/*.local.txt, *.log and .git
# (docs/AUDIT/security.md #2). This script stages only allowed files into a
# temp dir (mirroring .gitignore's secret rules), zips that, and verifies the
# archive contains no excluded pattern before reporting success.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
# (no BOM), so em dashes / arrows in comments break the parser.
#
# Usage:  npm run dist
# Output: dist/nilad-source-<yyyyMMdd-HHmm>.zip
param( [string]$OutDir = "dist" )

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Directory segments to skip entirely (any depth).
$skipDirs = @('.git', 'node_modules', 'wordpress', '.n8n', 'postgres-data', 'dist', 'cache', 'vendor')
# File name patterns to skip (mirrors .gitignore secrets / dumps / logs).
$skipFiles = @(
    '\\\.env$',            # any .env at any depth, e.g. root and n8n\ (keeps .env.example)
    '\.env\.local$',
    '\.local\.txt$',       # oauth-client / owner-account local files
    '\.log$',
    '^dump',
    '\.sqlite$',
    '\.sql$',
    '\.sql\.gz$',
    '^Thumbs\.db$',
    '^\.DS_Store$'
)

$files = Get-ChildItem -Path $root -Recurse -File -Force | Where-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    $segments = $rel -split '\\'
    $skip = $false
    foreach ($seg in $segments[0..($segments.Length - 2)]) {
        if ($skipDirs -contains $seg) { $skip = $true; break }
    }
    if (-not $skip) {
        foreach ($pat in $skipFiles) {
            if ($rel -match $pat) { $skip = $true; break }
        }
    }
    -not $skip
}

if ($files.Count -eq 0) { throw "No files selected - aborting." }

# Stage first: Compress-Archive mangles full paths, and .NET CreateFromDirectory
# has no exclusion list on PS 5.1, so a filtered staging copy is the reliable way.
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("nilad-dist-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($root.Length + 1)
        $dest = Join-Path $stage $rel
        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
    }

    $outRoot = Join-Path $root $OutDir
    if (-not (Test-Path $outRoot)) { New-Item -ItemType Directory -Path $outRoot | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    $zip = Join-Path $outRoot ("nilad-source-" + $stamp + ".zip")
    if (Test-Path $zip) { Remove-Item $zip -Force }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    # Build entries by hand with '/' separators: CreateFromDirectory (and
    # Compress-Archive) on Windows writes '\' inside entry names, which extracts
    # as literal backslashes on Linux/macOS. The ZIP spec requires '/'.
    $za = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
    try {
        foreach ($f in (Get-ChildItem -Path $stage -Recurse -File -Force)) {
            $entryName = $f.FullName.Substring($stage.Length + 1).Replace('\', '/')
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $f.FullName, $entryName, 'Optimal')
        }
    }
    finally {
        $za.Dispose()
    }
}
finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
}

# Verify: re-open the archive and assert no excluded entry slipped in.
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName })
}
finally {
    $archive.Dispose()
}
$bad = $entries | Where-Object {
    $_ -match '(^|\\)\.env$' -or
    $_ -match '\.local\.txt$' -or
    $_ -match '\.log$' -or
    $_ -match '(^|\\)\.git\\' -or
    $_ -match '(^|\\)node_modules\\' -or
    $_ -match '\.env\.local$' -or
    $_ -match '\.sql$'
}
$size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Output ("CHECK package: files={0} entries={1} size={2}KB" -f $files.Count, $entries.Count, $size)
if ($bad) {
    Write-Output ("CHECK package-secrets: FAIL ({0} forbidden entries)" -f $bad.Count)
    $bad | Select-Object -First 10 | ForEach-Object { Write-Output "  FORBIDDEN: $_" }
    exit 1
}
Write-Output "CHECK package-secrets: PASS (no .env / .local.txt / .log / .git / node_modules / .sql)"
Write-Output "CHECK package: $zip"