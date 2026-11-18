# Stage a verified copy. The live server and its .data directory are untouched.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^snapshot-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}$')]
    [string] $Snapshot
)
. (Join-Path $PSScriptRoot 'backup-functions.ps1')
$root = Get-InstallRoot
$backups = Get-PrivateFolder $root 'backups'
$snapshotDir = Join-Path $backups $Snapshot
$manifestFile = Join-Path $snapshotDir 'manifest.json'
Assert-PlainPath $manifestFile
$manifest = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($manifestFile))
if ($manifest.version -ne 1 -or $manifest.name -cne $Snapshot) { throw 'Unknown backup manifest.' }
$source = Join-Path $snapshotDir 'data'
Assert-PlainPath $source
Assert-SameFiles @($manifest.files) @(Get-Fingerprints $source)
$staging = Get-PrivateFolder $root 'restore-staging'
$target = Join-Path $staging ($Snapshot + '-' + [Guid]::NewGuid().ToString('N'))
$pending = Join-Path $staging ('.partial-' + [IO.Path]::GetFileName($target))
Copy-DataTree $source $pending
Assert-SameFiles @($manifest.files) @(Get-Fingerprints $pending)
Assert-Store $pending
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($pending)) -ne $staging -or
    [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($target)) -ne $staging) { throw 'Invalid recovery path.' }
Assert-PlainPath $pending
[IO.Directory]::Move($pending, $target)
Write-Output "Verified recovery copy: $target"
