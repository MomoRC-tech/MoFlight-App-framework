# Dot-source this file to configure only the current PowerShell session.
param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$SdkRoot = $env:ANDROID_HOME
)

if (-not $JavaHome) {
    $JavaHome = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'dev-tools\jdk17\jdk-17.0.20.1+1'
}
if (-not $SdkRoot) { $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath "$JavaHome\bin\java.exe")) {
    throw 'JDK 17 is missing. Dot-source this script with -JavaHome pointing to an installed JDK 17.'
}
$javaVersion = & "$JavaHome\bin\java.exe" -version 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $javaVersion -notmatch 'version "17\.') {
    throw 'This lab uses JDK 17. Supply -JavaHome for JDK 17; Android Studio can keep its own bundled Java.'
}
if (-not (Test-Path -LiteralPath $SdkRoot)) {
    throw 'Android SDK directory is missing. Finish Android Studio setup or supply -SdkRoot.'
}
$env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome -ErrorAction Stop).Path
$env:ANDROID_HOME = (Resolve-Path -LiteralPath $SdkRoot -ErrorAction Stop).Path
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"
Write-Output "JDK 17: $env:JAVA_HOME"
Write-Output "Android SDK: $env:ANDROID_HOME"
if (-not (Test-Path -LiteralPath "$env:ANDROID_HOME\platform-tools\adb.exe")) {
    Write-Warning 'Platform Tools/ADB is not installed yet; finish SDK setup before native installation.'
}
