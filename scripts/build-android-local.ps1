param(
    [string]$SourceRepository = (Split-Path $PSScriptRoot -Parent),
    [string]$BuildDirectory = (Join-Path $env:USERPROFILE 'mf-build'),
    [string]$SourceRef = 'HEAD',
    [ValidateSet('Release', 'Debug', 'DevServer')][string]$Configuration = 'Release',
    [Parameter(Mandatory)][string]$JavaHome,
    [string]$SdkRoot = (Join-Path $env:LOCALAPPDATA 'Android/Sdk'),
    [string]$SmokeSerial,
    [string]$InstallSerial
)

$ErrorActionPreference = 'Stop'
if ($SmokeSerial -and $Configuration -ne 'Release') { throw 'Offline smoke requires a standalone Release APK.' }
function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}
function Read-Git([string]$Directory, [string[]]$Arguments) {
    $result = & git -C $Directory @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Git source validation failed' }
    return ($result -join "`n").Trim()
}

$source = (Resolve-Path -LiteralPath $SourceRepository).Path
$build = [IO.Path]::GetFullPath($BuildDirectory)
if ($build -eq $source -or $build.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Use a separate build checkout outside the source repository.'
}
if (Read-Git $source @('status', '--porcelain')) {
    if (-not $PSBoundParameters.ContainsKey('SourceRef')) { throw 'Commit source changes first; no private or untracked files are copied.' }
    Write-Warning 'Building only the explicitly selected commit; source drafts are preserved and excluded.'
}
$commit = Read-Git $source @('rev-parse', "$SourceRef^{commit}")
. (Join-Path $PSScriptRoot 'windows-android-env.ps1') -JavaHome $JavaHome -SdkRoot $SdkRoot
foreach ($tool in @('node', 'pnpm', 'python', 'git')) { Get-Command $tool -ErrorAction Stop | Out-Null }
if ((& node --version) -notmatch '^v24\.') { throw 'Use the repository Node 24 baseline.' }
if ((& pnpm --version) -ne '11.25.0') { throw 'Use the pinned pnpm 11.25.0.' }
if (-not (Test-Path -LiteralPath "$SdkRoot/platform-tools/adb.exe")) { throw 'Android Platform Tools are missing.' }
if (Test-Path -LiteralPath $build) {
    if (-not (Test-Path -LiteralPath "$build/.git")) { throw 'Build target already exists and is not this build checkout.' }
    $origin = Read-Git $build @('remote', 'get-url', 'origin')
    if ([IO.Path]::GetFullPath($origin) -ne $source) { throw 'Build checkout belongs to a different source repository.' }
    if (Read-Git $build @('status', '--porcelain')) { throw 'Build checkout has changes; preserve them before updating.' }
    Invoke-Checked git @('-C', $build, 'fetch', 'origin')
} else {
    Invoke-Checked git @('clone', '--no-hardlinks', $source, $build)
}
Invoke-Checked git @('-C', $build, 'switch', '--detach', $commit)
$timer = [Diagnostics.Stopwatch]::StartNew()
Push-Location $build
try {
    Invoke-Checked pnpm @('install', '--frozen-lockfile', '--node-linker=hoisted')
    $app = Join-Path $build 'apps/platform-lab'
    $android = Join-Path $app 'android'
    # Only regenerate native files when their inputs change; preserve native caches.
    $nativeInputs = @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'apps/platform-lab/package.json', 'apps/platform-lab/app.json', 'scripts/configure-windows-native-build.ps1')
    $nativeInputs += @((Read-Git $build @('ls-files', '**/package.json', 'apps/platform-lab/app.config.*', 'apps/platform-lab/plugins')) -split "`n" | Where-Object { $_ })
    $fingerprint = Read-Git $build (@('ls-tree', '-r', 'HEAD', '--') + $nativeInputs)
    $stamp = Join-Path $build 'local-data/native-inputs.txt'
    $regenerate = -not (Test-Path -LiteralPath "$android/gradlew.bat") -or -not (Test-Path -LiteralPath $stamp)
    if (-not $regenerate) { $regenerate = [IO.File]::ReadAllText($stamp) -ne $fingerprint }
    if ($regenerate) {
        Push-Location $app
        try { Invoke-Checked node @((Join-Path $build 'node_modules/expo/bin/cli'), 'prebuild', '--no-install', '--platform', 'android') }
        finally { Pop-Location }
        New-Item -ItemType Directory -Force -Path (Split-Path $stamp -Parent) | Out-Null
        [IO.File]::WriteAllText($stamp, $fingerprint)
    }
    & (Join-Path $PSScriptRoot 'configure-windows-native-build.ps1') -AndroidDirectory $android
    if ($Configuration -eq 'DevServer') {
        Push-Location $app
        try { Invoke-Checked node @((Join-Path $build 'node_modules/expo/bin/cli'), 'start', '--dev-client', '--localhost') }
        finally { Pop-Location }
        return
    }
    $variant = $Configuration.ToLowerInvariant()
    $env:NODE_ENV = if ($Configuration -eq 'Release') { 'production' } else { 'development' }
    Push-Location $android
    $gradleTimer = [Diagnostics.Stopwatch]::StartNew()
    try { Invoke-Checked '.\gradlew.bat' @((':app:assemble' + $Configuration), '-PreactNativeArchitectures=arm64-v8a,x86_64', '--max-workers=2') }
    finally { $gradleTimer.Stop(); Pop-Location }
    $apk = Join-Path $android "app/build/outputs/apk/$variant/app-$variant.apk"
    if (-not (Test-Path -LiteralPath $apk)) { throw 'Gradle did not produce the expected APK.' }
    if ($Configuration -eq 'Release') { Invoke-Checked python @((Join-Path $PSScriptRoot 'android_smoke.py'), '--check-apk', $apk) }
    $timer.Stop()
    $manifest = [ordered]@{ source_commit=$commit; configuration=$Configuration; apk=$apk; apk_sha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant(); elapsed_seconds=$timer.Elapsed.TotalSeconds; gradle_seconds=$gradleTimer.Elapsed.TotalSeconds; native_regenerated=$regenerate; built_at_utc=[DateTime]::UtcNow.ToString('o') }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath "local-data/build-$variant.json" -Encoding utf8
    if ($InstallSerial) { Invoke-Checked adb @('-s', $InstallSerial, 'install', '-r', $apk) }
    if ($SmokeSerial) {
        if ($Configuration -ne 'Release') { throw 'Offline smoke requires a standalone Release APK.' }
        $env:VALIDATED_SOURCE_COMMIT = $commit
        $env:APK_SOURCE_COMMIT = $commit
        Invoke-Checked python @((Join-Path $PSScriptRoot 'android_smoke.py'), '--apk', $apk, '--serial', $SmokeSerial, '--expected-avd', 'MoFlight_Synthetic_API37', '--output', 'local-data/android-smoke')
    }
    $manifest | ConvertTo-Json
} finally { Pop-Location }
