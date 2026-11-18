# This bridge has no socket listener and accepts only the view-only host's GET routes.
param([ValidateSet('DesktopView','DesktopControlTest')][string]$Profile='DesktopView')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$pairing=Join-Path $env:LOCALAPPDATA ('Parallax\Station\'+$Profile+'\pairing.json')
while($null -ne ($line=[Console]::ReadLine())){
  $id=$null
  try{
    if($line.Length -gt 2048){throw 'Invalid bridge request.'}
    $request=$line|ConvertFrom-Json;$id=$request.id;$path=[string]$request.path;$method=if($request.method){[string]$request.method}else{'GET'}
    if(-not (($method -eq 'GET' -and $path -match '^/(health|v1/(desktop|frame))(\?[a-zA-Z0-9%=&._-]*)?$') -or ($method -eq 'POST' -and $path -match '^/v1/control/(lease|renew|release|input)$'))){throw 'Unsupported desktop route.'}
    $pair=Get-Content -LiteralPath $pairing -Raw|ConvertFrom-Json
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$fingerprint=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$pair.token))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    if([string]$request.credentialFingerprint -cne $fingerprint){[Console]::WriteLine((@{id=$id;status=401;body=@{message='The desktop-view device credential changed. Reconnect the relay.'}}|ConvertTo-Json -Compress));continue}
    $origin=[Uri]$pair.origin
    if(-not $origin.IsLoopback -or $origin.Scheme -ne 'http' -or $origin.AbsolutePath -ne '/'){throw 'Invalid local host origin.'}
    $arguments=@{Uri=$pair.origin+$path;Method=$method;Headers=@{Authorization='Bearer '+$pair.token};UseBasicParsing=$true;TimeoutSec=10}
    if($method -eq 'POST'){$arguments.ContentType='application/json';$arguments.Body=($request.body|ConvertTo-Json -Depth 4 -Compress)}
    $response=Invoke-WebRequest @arguments
    $body=$response.Content|ConvertFrom-Json
    [Console]::WriteLine((@{id=$id;status=[int]$response.StatusCode;body=$body}|ConvertTo-Json -Depth 12 -Compress))
  }catch{
    $status=502
    if($_.Exception.Response){$status=[int]$_.Exception.Response.StatusCode}
    [Console]::WriteLine((@{id=$id;status=$status;body=@{message='The local desktop view host could not complete this request.'}}|ConvertTo-Json -Compress))
  }
}
