# Shared by backup-data.ps1 and restore-data.ps1 (Windows PowerShell 5.1+).
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-PlainPath([string] $Path) {
    $current = Get-Item -Force -LiteralPath $Path
    while ($null -ne $current) {
        if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "A link or junction is not a supported backup path: $($current.FullName)"
        }
        if ($current -is [IO.FileInfo]) { $current = $current.Directory }
        else { $current = $current.Parent }
    }
}

function Get-InstallRoot {
    $site = [IO.Directory]::GetParent($PSScriptRoot).Parent
    if ($site.Name -ne 'site' -or $site.Parent.Name -ne 'bareunfund') {
        throw 'Install these scripts under bareunfund\site\scripts\windows.'
    }
    Assert-PlainPath $PSScriptRoot
    return $site.Parent.FullName
}

function Get-PrivateFolder([string] $Parent, [string] $Name) {
    $folder = Join-Path $Parent $Name
    $system = [Security.Principal.SecurityIdentifier]'S-1-5-18'
    $admins = [Security.Principal.SecurityIdentifier]'S-1-5-32-544'
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $allowed = @($system.Value, $admins.Value, $user.Value)
    if (-not [IO.Directory]::Exists($folder)) {
        [void][IO.Directory]::CreateDirectory($folder)
        Assert-PlainPath $folder
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($sid in @($system, $admins, $user)) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new(
                $sid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $folder -AclObject $acl
    }
    Assert-PlainPath $folder
    $acl = Get-Acl -LiteralPath $folder
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    if (-not $acl.AreAccessRulesProtected -or @($rules | Where-Object {
        $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin $allowed
    }).Count) {
        throw "The backup directory is accessible by other accounts: $folder"
    }
    return $folder
}

function Get-DataFiles([string] $Directory) {
    foreach ($entry in Get-ChildItem -Force -LiteralPath $Directory) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Refusing link in data directory: $($entry.FullName)"
        }
        if ($entry.PSIsContainer) { Get-DataFiles $entry.FullName }
        else { $entry }
    }
}

function Get-Fingerprints([string] $Directory) {
    $rows = foreach ($file in Get-DataFiles $Directory) {
        [pscustomobject]@{
            name = $file.FullName.Substring($Directory.Length + 1).Replace('\', '/')
            size = $file.Length
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash
        }
    }
    $rows | Sort-Object -Property name
}

function Assert-SameFiles([object[]] $Expected, [object[]] $Actual) {
    if ($Expected.Count -ne $Actual.Count) { throw 'Snapshot file count differs.' }
    for ($i = 0; $i -lt $Expected.Count; $i++) {
        if ($Expected[$i].name -cne $Actual[$i].name -or
            $Expected[$i].size -ne $Actual[$i].size -or
            $Expected[$i].sha256 -ne $Actual[$i].sha256) {
            throw "Snapshot changed or is damaged: $($Expected[$i].name)"
        }
    }
}

function Copy-DataTree([string] $From, [string] $To) {
    [void][IO.Directory]::CreateDirectory($To)
    foreach ($file in Get-DataFiles $From) {
        $target = Join-Path $To $file.FullName.Substring($From.Length + 1)
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
        [IO.File]::Copy($file.FullName, $target, $false)
    }
}

function Assert-Store([string] $Directory) {
    $documents = Join-Path $Directory 'documents'
    $index = Join-Path $documents 'index.json'
    $ids = @{}
    if (Test-Path -LiteralPath $index -PathType Leaf) {
        $raw = [IO.File]::ReadAllText($index)
        if (-not $raw.TrimStart().StartsWith('[')) { throw 'Invalid document index.' }
        foreach ($doc in (ConvertFrom-Json -InputObject $raw)) {
            if ($doc.id -notmatch '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$' -or
                $ids.ContainsKey($doc.id)) { throw 'Invalid or duplicate document ID.' }
            $ids[$doc.id] = $true
            $blob = Get-Item -LiteralPath (Join-Path $documents ($doc.id + '.bin'))
            if ($blob.Length -ne $doc.size) { throw 'Document size differs from index.' }
        }
    }
    if (Test-Path -LiteralPath $documents) {
        foreach ($blob in Get-ChildItem -LiteralPath $documents -File -Filter '*.bin') {
            if (-not $ids.ContainsKey($blob.BaseName)) { throw 'Unindexed document. Retry after active writes finish.' }
        }
    }
    $training = Join-Path $Directory 'training.json'
    if (Test-Path -LiteralPath $training -PathType Leaf) {
        $model = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($training))
        if ($null -eq $model.revision) { throw 'Training revision missing.' }
    }
}
