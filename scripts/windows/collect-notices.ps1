[CmdletBinding()]
param([string]$Root='D:\bareunfund')
$ErrorActionPreference='Stop'
$site=Join-Path (Resolve-Path -LiteralPath $Root).Path 'site'
$settings=Join-Path $site '.env.integrations.local'
if (!(Test-Path -LiteralPath $settings)) { throw 'Integration settings are not configured. Copy .env.integrations.example locally and enter approved keys.' }
Set-Location -LiteralPath $site
& node.exe "--env-file=$settings" scripts/integrations/collect-notices.mjs
if ($LASTEXITCODE -ne 0) { throw 'Notice collection did not complete. Check configuration without printing credentials.' }
