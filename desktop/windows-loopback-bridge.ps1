# This bridge has no socket listener and accepts only the view-only host's GET routes.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$pairing=Join-Path $env:LOCALAPPDATA 'Parallax\Station\DesktopView\pairing.json'
while($null -ne ($line=[Console]::ReadLine())){
  $id=$null
  try{
    if($line.Length -gt 2048){throw 'Invalid bridge request.'}
    $request=$line|ConvertFrom-Json;$id=$request.id;$path=[string]$request.path
    if($path -notmatch '^/(health|v1/(desktop|frame))(\?[a-zA-Z0-9%=&._-]*)?$'){throw 'Unsupported view-only route.'}
    $pair=Get-Content -LiteralPath $pairing -Raw|ConvertFrom-Json
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$fingerprint=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$pair.token))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    if([string]$request.credentialFingerprint -cne $fingerprint){[Console]::WriteLine((@{id=$id;status=401;body=@{message='The desktop-view device credential changed. Reconnect the relay.'}}|ConvertTo-Json -Compress));continue}
    $origin=[Uri]$pair.origin
    if(-not $origin.IsLoopback -or $origin.Scheme -ne 'http' -or $origin.AbsolutePath -ne '/'){throw 'Invalid local host origin.'}
    $response=Invoke-WebRequest ($pair.origin+$path) -Headers @{Authorization='Bearer '+$pair.token} -UseBasicParsing -TimeoutSec 10
    $body=$response.Content|ConvertFrom-Json
    [Console]::WriteLine((@{id=$id;status=[int]$response.StatusCode;body=$body}|ConvertTo-Json -Depth 12 -Compress))
  }catch{
    $status=502
    if($_.Exception.Response){$status=[int]$_.Exception.Response.StatusCode}
    [Console]::WriteLine((@{id=$id;status=$status;body=@{message='The local desktop view host could not complete this request.'}}|ConvertTo-Json -Compress))
  }
}
