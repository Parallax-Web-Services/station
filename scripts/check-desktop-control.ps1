#requires -Version 5.1
# Real input is permitted only in the companion's explicit --control-test window.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StationInputAcceptance {
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr window,int x,int y,int width,int height,bool repaint);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
$priorDpi=[StationInputAcceptance]::SetThreadDpiAwarenessContext([IntPtr](-4))
$cursor=New-Object StationInputAcceptance+Point
[void][StationInputAcceptance]::GetCursorPos([ref]$cursor)
$pair=Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'Parallax\Station\DesktopControlTest\pairing.json') -Raw|ConvertFrom-Json
if($pair.origin -ne 'http://127.0.0.1:8762'){throw 'This checker only supports the isolated test host.'}
$headers=@{Authorization='Bearer '+$pair.token}
function Request($path,$body=$null,$expected=200){
 $method=if($null -eq $body){'GET'}else{'POST'}
 try{
  $args=@{Uri=$pair.origin+$path;Method=$method;Headers=$headers;UseBasicParsing=$true;TimeoutSec=10}
  if($null -ne $body){$args.ContentType='application/json';$args.Body=($body|ConvertTo-Json -Compress)}
  $response=Invoke-WebRequest @args
  if([int]$response.StatusCode -ne $expected){throw 'Unexpected control-test status.'}
  if($response.Content){return ($response.Content|ConvertFrom-Json)}
 }catch{
  if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq $expected){return}
  throw
 }
}
$script:scope=$null;$script:sequence=0
function Scoped{ $body=@{};foreach($key in $script:scope.Keys){$body[$key]=$script:scope[$key]};return $body }
function InputEvent($type,$point=$null,$key=0,$expected=200){
 $body=Scoped;$body.type=$type;$script:sequence++;$body.sequence=$script:sequence
 if($point){$body.u=($point.x-$script:monitor.bounds.x)/($script:monitor.bounds.width-1);$body.v=($point.y-$script:monitor.bounds.y)/($script:monitor.bounds.height-1);$body.button='left'}
 if($key){$body.key=$key}
 Request '/v1/control/input' $body $expected
}
function Click($point){$null=InputEvent 'pointerDown' $point;$null=InputEvent 'pointerUp' $point;Start-Sleep -Milliseconds 100}
try{
 $state=Request '/v1/control-test';if(-not $state.controlAllowed){throw 'Start a fresh isolated control-test host before acceptance.'}
 $inventory=Request '/v1/desktop'
 $process=@(Get-Process -Name Parallax.Station.DesktopViewHost|Where-Object{$_.Path -like '*\artifacts\desktop-control-host\Parallax.Station.DesktopViewHost.exe' -and $_.MainWindowTitle -like 'PARALLAX STATION*Isolated input test'})
 if($process.Count -ne 1){throw 'The isolated test window could not be identified uniquely.'}
 $window=$process[0].MainWindowHandle
 foreach($selected in @($inventory.monitors|Sort-Object primary -Descending)){
  [void][StationInputAcceptance]::MoveWindow($window,($selected.bounds.x+80),($selected.bounds.y+80),640,560,$true)
  [void][StationInputAcceptance]::SetForegroundWindow($window)
  Start-Sleep -Milliseconds 350
  $state=Request '/v1/control-test';$script:monitor=$selected
  if($state.input.x -lt $selected.bounds.x -or $state.input.x -ge ($selected.bounds.x+$selected.bounds.width)){throw 'Test window did not move to the selected physical monitor.'}
  $script:scope=@{hostId=$inventory.hostId;monitorId=$selected.id;layoutRevision=$inventory.layoutRevision}
  $lease=Request '/v1/control/lease' (Scoped);$script:scope.leaseId=$lease.leaseId;$script:sequence=0
  $null=Request '/v1/control/renew' (Scoped)
  $before=[int]$state.clicks;Click $state.target
  if((Request '/v1/control-test').clicks -ne $before+1){throw 'Actual pointer click did not reach the visible target.'}
  $duplicate=Scoped;$duplicate.type='pointerMove';$duplicate.u=0.5;$duplicate.v=0.5;$duplicate.sequence=$script:sequence
  $null=Request '/v1/control/input' $duplicate 409
  $wrong=Scoped;$wrong.hostId='another-host';$null=Request '/v1/control/renew' $wrong 403
  $stale=Scoped;$stale.layoutRevision='stale';$null=Request '/v1/control/renew' $stale 409
  $null=Request '/v1/control/renew' (Scoped) 403
  $lease=Request '/v1/control/lease' @{hostId=$inventory.hostId;monitorId=$selected.id;layoutRevision=$inventory.layoutRevision};$script:scope.leaseId=$lease.leaseId;$script:sequence=0
  Click $state.input
  $beforeText=(Request '/v1/control-test').text
  $null=InputEvent 'keyDown' $null 65;$null=InputEvent 'keyUp' $null 65
  Start-Sleep -Milliseconds 150
  $afterText=(Request '/v1/control-test').text
  if($afterText.Length -ne $beforeText.Length+1 -or $afterText.ToLowerInvariant() -notlike '*a*'){throw 'Actual typing did not reach the isolated text box.'}
  $null=Request '/v1/control/release' (Scoped)
  $null=InputEvent 'keyDown' $null 66 403
  Write-Output ('Actual click, typing, no-replay and scope/revoke checks passed on monitor scale '+$selected.scale+'.')
 }
 $lease=Request '/v1/control/lease' @{hostId=$inventory.hostId;monitorId=$script:monitor.id;layoutRevision=$inventory.layoutRevision};$script:scope.leaseId=$lease.leaseId;$script:sequence=0
 $null=InputEvent 'keyDown' $null 16
 Start-Sleep -Milliseconds 5500
 if(([StationInputAcceptance]::GetAsyncKeyState(16) -band 0x8000) -ne 0){throw 'Expired lease left Shift held.'}
 $null=Request '/v1/control/renew' (Scoped) 403
 Write-Output 'Heartbeat expiry rejected renewal and released the held modifier.'
 $lease=Request '/v1/control/lease' @{hostId=$inventory.hostId;monitorId=$script:monitor.id;layoutRevision=$inventory.layoutRevision};$script:scope.leaseId=$lease.leaseId;$script:sequence=0
 $state=Request '/v1/control-test';$point=$state.allow
 # Click inside the check mark rather than its label center.
 $point.x=$script:monitor.bounds.x+80+35
 $null=InputEvent 'pointerDown' $point
 Start-Sleep -Milliseconds 150
 $null=InputEvent 'pointerUp' $point 0 403
 if((Request '/v1/control-test').controlAllowed){throw 'Host revoke control did not disable control.'}
 $null=Request '/v1/control/lease' @{hostId=$inventory.hostId;monitorId=$script:monitor.id;layoutRevision=$inventory.layoutRevision} 403
 Write-Output 'Visible host revoke disabled control and rejected new leases.'
}finally{
 if($script:scope){try{$null=Request '/v1/control/release' (Scoped)}catch{}}
 [void][StationInputAcceptance]::SetCursorPos($cursor.X,$cursor.Y)
 if($priorDpi -ne [IntPtr]::Zero){[void][StationInputAcceptance]::SetThreadDpiAwarenessContext($priorDpi)}
}
