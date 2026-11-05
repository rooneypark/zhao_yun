$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$files = Get-Content (Join-Path $PSScriptRoot 'overlord-release-files.json') -Raw | ConvertFrom-Json
$hashes = @{
    maps = '82c7878fa3be0f5d32dbd0f0547b58c993a18ac82eeaf2cef4730c0db8e86e8b'
    motion = '63ac176ddfb14b23af0e243f16e1a93fc12b086f15fa5ef0c39650663e96d1bd'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($group in 'maps', 'motion') {
    $missing = @($files.$group | Where-Object { ![IO.File]::Exists((Join-Path $root $_)) })
    if (!$missing.Count) { continue }
    $temp = [IO.Path]::GetTempFileName()
    try {
        Write-Host "Downloading overlord-$group.zip for $($missing.Count) missing files..."
        $url = "https://github.com/rooneypark/zhao_yun/releases/download/overlord-assets-v1/overlord-$group.zip"
        & curl.exe --fail --location --retry 2 --output $temp $url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
        if ((Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash -ne $hashes[$group]) { throw "ZIP checksum mismatch: $group" }
        $zip = [IO.Compression.ZipFile]::OpenRead($temp)
        try {
            foreach ($name in $missing) {
                $entry = $zip.GetEntry($name)
                if (!$entry) { throw "Missing from release: $name" }
                $target = Join-Path $root $name
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
                $part = "$target.$([guid]::NewGuid()).part"
                try {
                    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$part)
                    if (![IO.File]::Exists($target)) { [IO.File]::Move($part,$target) }
                } finally { if ([IO.File]::Exists($part)) { [IO.File]::Delete($part) } }
            }
        } finally { $zip.Dispose() }
    } finally { [IO.File]::Delete($temp) }
}
