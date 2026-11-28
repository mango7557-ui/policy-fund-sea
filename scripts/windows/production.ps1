[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Build','Serve','Start','Check')][string]$Action,
    [string]$Root = 'D:\bareunfund',
    [ValidateRange(1,65535)][int]$Port = 38571
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$site = Join-Path $rootPath 'site'
$runtime = Join-Path $rootPath 'runtime'
$node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$manifest = Join-Path $runtime 'production-release.txt'
$releases = Join-Path $site '.bareun-production'
$address = "http://127.0.0.1:$Port"

function Assert-Health {
    $homePage = Invoke-WebRequest "$address/" -UseBasicParsing -TimeoutSec 10
    if ($homePage.StatusCode -ne 200) { throw 'Homepage unavailable.' }
    $endpoint = "$address/api/admin/documents"
    try {
        $null = Invoke-WebRequest $endpoint -UseBasicParsing -TimeoutSec 10
        throw 'Document store accepted an anonymous request.'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) { throw }
    }
    # Node loads the key from its existing file, without printing it or placing it in arguments.
    $probe = @'
const fs = require('node:fs');
async function checkDocuments() {
    const index = JSON.parse(fs.readFileSync('.data/documents/index.json', 'utf8'));
    const response = await fetch(process.argv[2], {
        headers: { Authorization: 'Bearer ' + process.env.ADMIN_ACCESS_TOKEN },
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const body = await response.json();
    const ids = records => records.map(record => record.id).sort();
    const expected = ids(index.filter(record => !record.deletedAt));
    const actual = ids(body.documents);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw Error('Active document IDs differ from the server data index.');
    }
    console.log('Verified active documents: ' + actual.length);
}
checkDocuments().catch(error => { console.error(error.message); process.exitCode = 1; });
'@
    $probe | & $node '--env-file=.env.local' '-' $endpoint
    if ($LASTEXITCODE -ne 0) { throw 'Authenticated document check failed.' }
}

Set-Location -LiteralPath $site
if ($Action -eq 'Check') { Assert-Health; return }
$next = & $node -p "require.resolve('next/dist/bin/next')"
if ($LASTEXITCODE -ne 0) { throw 'Install site dependencies before building or starting the server.' }

$env:TEMP = Join-Path $rootPath 'temp'
$env:TMP = $env:TEMP
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NODE_ENV = 'production'
$modelSetting = Get-Content -LiteralPath (Join-Path $site '.env.local') | Where-Object { $_ -match '^OLLAMA_MODEL=' } | Select-Object -Last 1
$env:OLLAMA_MODEL = if ($modelSetting) { ($modelSetting -split '=',2)[1].Trim().Trim('"').Trim("'") } else { 'qwen2.5:7b' }
$env:BAREUN_DATA_DIR = Join-Path $site '.data'
$env:TRAINING_DATA_FILE = Join-Path $env:BAREUN_DATA_DIR 'training.json'
if (-not $env:GSK_CONFIG) { $env:GSK_CONFIG = Join-Path $site '.data\genspark-config.json' }

if ($Action -eq 'Build') {
    $id = [guid]::NewGuid().ToString('N')
    $release = Join-Path $releases $id
    [void][IO.Directory]::CreateDirectory($release)
    [IO.File]::WriteAllText((Join-Path $releases '.gitignore'), "*`n")
    foreach ($folder in @($env:TEMP, (Join-Path $runtime 'logs'))) {
        [void][IO.Directory]::CreateDirectory($folder)
    }
    foreach ($item in @('src','public','scripts','package.json','package-lock.json','tsconfig.json','next.config.ts','postcss.config.mjs')) {
        Copy-Item -LiteralPath (Join-Path $site $item) -Destination $release -Recurse
    }
    Push-Location -LiteralPath $release
    try {
        & $node $next build
        if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath '.next\BUILD_ID')) { throw 'Production build failed.' }
    } finally { Pop-Location }
    $pending = Join-Path $runtime "$id.pending"
    [IO.File]::WriteAllText($pending, $id)
    if ([IO.File]::Exists($manifest)) { [IO.File]::Replace($pending, $manifest, "$manifest.previous") }
    else { [IO.File]::Move($pending, $manifest) }
    Write-Output "Production release prepared: $id"
    return
}

$id = [IO.File]::ReadAllText($manifest).Trim()
if ($id -notmatch '^[0-9a-f]{32}$') { throw 'Unexpected production release identifier.' }
$release = Join-Path $releases $id
if (!(Test-Path -LiteralPath (Join-Path $release '.next\BUILD_ID'))) { throw 'Build the production release first.' }
if (!(Test-Path -LiteralPath '.env.local')) { throw 'Expected the existing server .env.local.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already occupied. Review its owner before switching servers."
}

# Keep the process cwd at site so existing document and training stores remain authoritative.
$arguments = @('--env-file=.env.local', $next, 'start', $release, '-H', '127.0.0.1', '-p', [string]$Port)
if ($Action -eq 'Serve') {
    & $node @arguments
    exit $LASTEXITCODE
}
$logBase = Join-Path $runtime ('logs\server-' + [guid]::NewGuid().ToString('N'))
$quoted = $arguments | ForEach-Object { '"' + $_ + '"' }
$process = Start-Process -FilePath $node -ArgumentList $quoted -WorkingDirectory $site -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logBase.log" -RedirectStandardError "$logBase.err"
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(80)
    do {
        Start-Sleep -Milliseconds 750
        if ($process.HasExited) { throw 'Server process exited.' }
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener) {
            if ($listener.OwningProcess -ne $process.Id -or $listener.LocalAddress -ne '127.0.0.1') {
                throw 'Unexpected listener. Check server ownership.'
            }
            Assert-Health
            Write-Output "Production server is ready at $address (PID $($process.Id))."
            return
        }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Server did not become ready before the timeout.'
} catch {
    if (!$process.HasExited) { $process.Kill(); $process.WaitForExit(10000) | Out-Null }
    throw "Production startup failed: $($_.Exception.Message) Logs: $logBase.log and $logBase.err"
}
