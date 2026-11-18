# Transition only the original Bareun Fund loopback development listener.
[CmdletBinding()]
param([switch] $InspectOnly)

. (Join-Path $PSScriptRoot 'backup-functions.ps1')
$root = Get-InstallRoot
$site = Join-Path $root 'site'
$port = 38571
$node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$cli = Join-Path $site 'node_modules\next\dist\bin\next'
$worker = Join-Path $site 'node_modules\next\dist\server\lib\start-server.js'
$production = Join-Path $PSScriptRoot 'production.ps1'
$fallback = Join-Path $root 'start-local.ps1'

function Get-ListenerId {
    $listeners = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        Where-Object Port -eq $port)
    if ($listeners.Count -eq 0) { return 0 }
    if ($listeners.Count -ne 1 -or $listeners[0].Address.ToString() -ne '127.0.0.1') {
        throw 'The port has an unexpected listening address. No process was stopped.'
    }
    $connection = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
    if ($connection.Count -ne 1 -or $connection[0].LocalAddress -ne '127.0.0.1') {
        throw 'The listener changed during inspection.'
    }
    return [int]$connection[0].OwningProcess
}

function Get-ProcessRecord([int] $Number) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$Number" -ErrorAction Stop
    if (!$p -or $p.ExecutablePath -ne $node) { throw "Cannot verify node.exe for PID $Number." }
    return $p
}

function Get-Arguments([string] $Line) {
    # Only accept the simple quoted/unquoted tokens produced by our Windows launchers.
    if ($Line -notmatch '^\s*(?:"[^"]+"|[^\s"]+)(?:\s+(?:"[^"]+"|[^\s"]+))*\s*$') {
        throw 'Unrecognized Windows launch arguments.'
    }
    foreach ($part in [regex]::Matches($Line, '"([^"]+)"|[^\s"]+')) {
        $part.Value.Trim('"').Replace('/', '\')
    }
}

function Test-DevCommand([string[]] $Tokens, [bool] $RelativeAllowed) {
    if ($Tokens.Count -ne 7 -or $Tokens[2] -cne 'dev') { return $false }
    $validCli = $Tokens[1] -eq $cli -or
        ($RelativeAllowed -and $Tokens[1] -in @('node_modules\next\dist\bin\next', '.\node_modules\next\dist\bin\next'))
    $options = $Tokens[3..6] -join ' '
    return $validCli -and $options -cmatch '^(?:(?:-H|--hostname) 127\.0\.0\.1 (?:-p|--port) 38571|(?:-p|--port) 38571 (?:-H|--hostname) 127\.0\.0\.1)$'
}

function Get-ServerOwner {
    $ownerId = Get-ListenerId
    if (!$ownerId) { return [pscustomobject]@{ Kind = 'idle'; Processes = @() } }
    $child = Get-ProcessRecord $ownerId
    $tokens = @(Get-Arguments $child.CommandLine)
    $releaseParent = Join-Path $site '.bareun-production'
    if ($tokens.Count -eq 9 -and $tokens[1] -eq '--env-file=.env.local' -and
        $tokens[2] -eq $cli -and $tokens[3] -ceq 'start' -and
        [IO.Path]::GetDirectoryName($tokens[4]) -eq $releaseParent -and
        [IO.Path]::GetFileName($tokens[4]) -match '^[0-9a-f]{32}$' -and
        ($tokens[5..8] -join ' ') -ceq '-H 127.0.0.1 -p 38571') {
        return [pscustomobject]@{ Kind = 'production'; Processes = @($child) }
    }
    if ($tokens.Count -eq 2 -and $tokens[1] -eq $worker) {
        $parent = Get-ProcessRecord $child.ParentProcessId
        if ($parent.CreationDate -gt $child.CreationDate -or
            !(Test-DevCommand @(Get-Arguments $parent.CommandLine) $true)) {
            throw 'The listener is not a child of the expected Next dev command.'
        }
        $owned = @($parent, $child)
    } elseif (Test-DevCommand $tokens $false) {
        $owned = @($child)
    } else {
        throw 'The listener does not match a recognized Bareun Fund server.'
    }
    foreach ($p in $owned) {
        if (Get-CimInstance Win32_Service -Filter "ProcessId=$($p.ProcessId)" -ErrorAction Stop) {
            throw 'The listener belongs to a Windows service.'
        }
    }
    return [pscustomobject]@{ Kind = 'development'; Processes = $owned }
}

$initial = Get-ServerOwner
Write-Output "Port $port status: $($initial.Kind)"
if ($InspectOnly) { return }
if ($initial.Kind -eq 'production') {
    & $production -Action Check -Root $root -Port $port
    return
}
if ($initial.Kind -eq 'development') { Assert-PlainPath $fallback }
& (Join-Path $PSScriptRoot 'backup-data.ps1')
& $production -Action Build -Root $root -Port $port

# Retain process handles before stopping either end of the dev parent/child pair.
$verified = Get-ServerOwner
if ($verified.Kind -ne $initial.Kind -or $verified.Processes.Count -ne $initial.Processes.Count) {
    throw 'The port owner changed during the build.'
}
$handles = @()
$switchStarted = $false
try {
    for ($i = 0; $i -lt $verified.Processes.Count; $i++) {
        $record = $verified.Processes[$i]
        if ($record.ProcessId -ne $initial.Processes[$i].ProcessId -or
            $record.CreationDate -ne $initial.Processes[$i].CreationDate) {
            throw 'The dev process restarted during the build.'
        }
        $process = [Diagnostics.Process]::GetProcessById($record.ProcessId)
        $null = $process.Handle
        $handles += $process
        $fresh = Get-ProcessRecord $record.ProcessId
        if ($fresh.CreationDate -ne $record.CreationDate -or $fresh.CommandLine -cne $record.CommandLine) {
            throw 'Process identity changed during inspection.'
        }
    }
    if ($handles.Count) {
        if ((Get-ListenerId) -ne $handles[-1].Id) { throw 'Listener changed before cutover.' }
        $clients = @(Get-NetTCPConnection -LocalPort $port -ErrorAction Stop |
            Where-Object State -eq Established)
        if ($clients.Count) { throw 'The development server has active client connections. Retry when idle.' }
    }
    $switchStarted = $true
    foreach ($process in $handles) {
        if (!$process.HasExited) {
            $process.Kill()
            if (!$process.WaitForExit(10000)) { throw 'The old server did not exit.' }
        }
    }
    & $production -Action Start -Root $root -Port $port
} catch {
    $failure = $_.Exception.Message
    if ($switchStarted -and $initial.Kind -eq 'development') {
        if ((Get-ListenerId) -eq 0) {
            & $fallback
            $online = $false
            for ($i = 0; $i -lt 25; $i++) {
                Start-Sleep -Milliseconds 800
                if ((Get-ServerOwner).Kind -eq 'development') { $online = $true; break }
            }
            if (!$online) { throw "Production switch failed ($failure). Dev restart unverified." }
            & $production -Action Check -Root $root -Port $port
            throw "Production switch failed ($failure). Restored the development server."
        }
    }
    throw
} finally {
    foreach ($process in $handles) { $process.Dispose() }
}
