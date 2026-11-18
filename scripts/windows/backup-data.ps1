# Run on the server. Only the .data store is captured. The admin key is separate.
. (Join-Path $PSScriptRoot 'backup-functions.ps1')
$root = Get-InstallRoot
$source = Join-Path $root 'site\.data'
Assert-PlainPath $source
$backups = Get-PrivateFolder $root 'backups'
$name = 'snapshot-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N')
$pending = Join-Path $backups ('.partial-' + $name)
$files = Join-Path $pending 'data'
$before = @(Get-Fingerprints $source)
if (@($before | Where-Object { $_.name -like '*.tmp' }).Count) {
    throw 'A temporary write is present. Retry after the active write finishes.'
}
Copy-DataTree $source $files
$copied = @(Get-Fingerprints $files)
Assert-SameFiles $before $copied
Assert-Store $files
Assert-SameFiles $before @(Get-Fingerprints $source)
$manifest = [ordered]@{ version = 1; name = $name; files = $copied }
[IO.File]::WriteAllText((Join-Path $pending 'manifest.json'), (ConvertTo-Json $manifest -Depth 5))
$target = Join-Path $backups $name
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($pending)) -ne $backups -or
    [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($target)) -ne $backups) { throw 'Invalid snapshot path.' }
Assert-PlainPath $pending
[IO.Directory]::Move($pending, $target)
Write-Output "Verified $($copied.Count) files. Snapshot: $name"
