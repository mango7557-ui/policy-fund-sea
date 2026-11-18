[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Account,
    [string]$Root = 'D:\bareunfund',
    [ValidateRange(1,65535)][int]$Port = 38571
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$site = Join-Path $rootPath 'site'
$runner = (Resolve-Path -LiteralPath (Join-Path $site 'scripts\windows\production.ps1')).Path
# Prepare for an existing dedicated local user. No account, privilege or task is created here.
$user = Get-LocalUser -Name ([WildcardPattern]::Escape($Account))
if (!$user.Enabled -or $user.SID.Value -match '-(500|501)$') {
    throw 'Select an enabled, dedicated local user.'
}
$admins = Get-LocalGroupMember -SID 'S-1-5-32-544'
if ($admins.SID.Value -contains $user.SID.Value) { throw 'Choose a non-administrative local user.' }

$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "{0}" -Action Serve -Root "{1}" -Port {2}' -f $runner, $rootPath, $Port
# Compose a definition offline. Task Scheduler is not contacted until the operator registers it.
[xml]$xml = @'
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers>
  <Principals><Principal id="Runner"><UserId/><LogonType>S4U</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>5</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Runner"><Exec><Command/><Arguments/><WorkingDirectory/></Exec></Actions>
</Task>
'@
$xml.Task.Principals.Principal.UserId = $user.SID.Value
$xml.Task.Actions.Exec.Command = $powerShell
$xml.Task.Actions.Exec.Arguments = $arguments
$xml.Task.Actions.Exec.WorkingDirectory = $site
$destination = Join-Path $rootPath 'runtime\BareunFund-Production.xml'
$xml.Save($destination)
Write-Output "Task definition ready for review: $destination"
