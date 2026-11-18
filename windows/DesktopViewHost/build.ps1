#requires -Version 5.1
[CmdletBinding()]
param([string]$OutputDirectory='')
$ErrorActionPreference='Stop'
if(-not $OutputDirectory){$OutputDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\artifacts\desktop-view-host'))}
$dotnet=Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'
& $dotnet publish (Join-Path $PSScriptRoot 'Parallax.Station.DesktopViewHost.csproj') -c Release --self-contained false -o $OutputDirectory --configfile (Join-Path $PSScriptRoot '..\NuGet.Config')
if($LASTEXITCODE -ne 0){throw 'Desktop view host build failed.'}
Write-Output ('Desktop view prototype: '+(Join-Path $OutputDirectory 'Parallax.Station.DesktopViewHost.exe'))
