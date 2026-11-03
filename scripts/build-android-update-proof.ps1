param(
    [Parameter(Mandatory)][string]$JavaHome,
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$SourceRef,
    [Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{0,30}$')][string]$Namespace,
    [Parameter(Mandatory)][ValidateSet('seed','verify')][string]$Mode,
    [ValidateSet('Update','AiChat','AiChatScreen','TaskSelector')][string]$Proof = 'Update',
    [switch]$ReuseNormalBuild
)
$ErrorActionPreference = 'Stop'
$evidence = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $evidence) { throw 'Use a new proof output directory; prior evidence is preserved.' }
New-Item -ItemType Directory -Path $evidence | Out-Null
$checkout = [IO.Path]::GetFullPath($BuildDirectory)
$root = Split-Path $PSScriptRoot -Parent
function Read-Git([string]$Directory, [string[]]$Arguments) {
    $result = & git -C $Directory @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Git source validation failed.' }
    return ($result -join "`n").Trim()
}
function Assert-PathInside([string]$Path, [string]$Directory) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($Directory).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escapes the isolated build checkout.' }
    return $fullPath
}

$root = [IO.Path]::GetFullPath($root)
$resolvedSourceCommit = Read-Git $root @('rev-parse', "$SourceRef^{commit}")
if ($checkout -eq $root -or $checkout.StartsWith($root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Use a separate build checkout outside the source repository.'
}
if (-not $ReuseNormalBuild) {
    & (Join-Path $PSScriptRoot 'build-android-local.ps1') -JavaHome $JavaHome -BuildDirectory $BuildDirectory -SourceRef $SourceRef
}
if (-not (Test-Path -LiteralPath (Join-Path $checkout '.git'))) { throw 'The selected build directory is not a Git checkout.' }
if (git -C $checkout status --porcelain) { throw 'Preserve dirty build checkout.' }
if ($ReuseNormalBuild) {
    $checkoutHead = Read-Git $checkout @('rev-parse', 'HEAD')
    if ($checkoutHead -ne $resolvedSourceCommit) { throw 'The normal build checkout does not match the resolved source ref.' }
    $origin = Read-Git $checkout @('remote', 'get-url', 'origin')
    if ([IO.Path]::GetFullPath($origin) -ne $root) { throw 'The normal build checkout belongs to another source repository.' }
}
$manifestPath = Join-Path $checkout 'local-data/build-release.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'The normal Release build manifest is missing.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.configuration -ne 'Release' -or $manifest.source_commit -ne $resolvedSourceCommit) { throw 'Normal Release manifest source/configuration mismatch.' }
$normalApkPath = if ([IO.Path]::IsPathRooted([string]$manifest.apk)) { [string]$manifest.apk } else { Join-Path $checkout ([string]$manifest.apk) }
$normalApkPath = Assert-PathInside $normalApkPath $checkout
if (-not (Test-Path -LiteralPath $normalApkPath)) { throw 'The normal Release APK is missing.' }
$normalHash = (Get-FileHash -LiteralPath $normalApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($normalHash -notmatch '^[0-9a-f]{64}$' -or $normalHash -ne ([string]$manifest.apk_sha256).ToLowerInvariant()) { throw 'Normal APK manifest hash mismatch.' }
$manifest.apk = $normalApkPath
$normal = Join-Path $evidence 'normal-app.apk'
Copy-Item -LiteralPath $normalApkPath -Destination $normal

$proofModule = if ($Proof -eq 'AiChatScreen') { 'android-ai-screen-poc' } elseif ($Proof -eq 'AiChat') { 'android-ai-chat-poc' } elseif ($Proof -eq 'TaskSelector') { 'android-task-selector-recovery-poc' } else { 'android-update-preservation-poc' }
$overrides = @{
    'apps/platform-lab/index.ts' = "import { registerRootComponent } from 'expo';`nimport Proof, { configureUpdateProof } from './src/development/$proofModule';`nconfigureUpdateProof('$Namespace','$Mode');`nregisterRootComponent(Proof);`n"
}
$proofSources = if ($Proof -eq 'Update') { @('apps/platform-lab/src/development/update-preservation-fixture.ts','apps/platform-lab/src/development/android-update-preservation-poc.tsx') } elseif ($Proof -eq 'TaskSelector') { @('apps/platform-lab/src/development/android-task-selector-recovery-poc.tsx') } else { @() }
$fixtureSourceCommit = $null
$fixtureSourceBlob = $null
$fixtureSourceSha256 = $null
if ($Proof -eq 'TaskSelector') {
    $fixtureSourceCommit = Read-Git $root @('rev-parse', 'HEAD')
    $builderRelative = 'scripts/build-android-update-proof.ps1'
    $fixtureRelative = 'apps/platform-lab/src/development/android-task-selector-recovery-poc.tsx'
    foreach ($relative in @($builderRelative, $fixtureRelative)) {
        Read-Git $root @('ls-files', '--error-unmatch', $relative) | Out-Null
        & git -C $root diff --quiet $fixtureSourceCommit -- $relative
        if ($LASTEXITCODE -ne 0) { throw 'Task selector proof inputs must be committed before building.' }
    }
    $fixtureSourceBlob = Read-Git $root @('rev-parse', "$fixtureSourceCommit`:$fixtureRelative")
    $fixturePath = Join-Path $root $fixtureRelative
    $fixtureSourceSha256 = (Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256).Hash.ToLowerInvariant()
}
foreach ($relative in $proofSources) {
    $overrides[$relative] = [IO.File]::ReadAllText((Join-Path $root $relative))
}
$originals = @{}
try {
    foreach ($relative in $overrides.Keys) {
        $target = Join-Path $checkout $relative
        $originals[$relative] = if (Test-Path -LiteralPath $target) { [IO.File]::ReadAllBytes($target) } else { $null }
        [IO.File]::WriteAllText($target,$overrides[$relative],[Text.UTF8Encoding]::new($false))
    }
    $env:JAVA_HOME = $JavaHome
    $env:NODE_ENV = 'production'
    $env:EXPO_PUBLIC_MOFLIGHT_SOURCE = $manifest.source_commit
    $env:PATH = "$JavaHome/bin;$env:PATH"
    Push-Location (Join-Path $checkout 'apps/platform-lab/android')
    try {
        & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --init-script (Join-Path $checkout 'scripts/android-source-input.gradle') *> (Join-Path $evidence 'proof-build.log')
        if ($LASTEXITCODE) { throw 'Upgrade proof build failed.' }
    } finally { Pop-Location }
    $proofName = if ($Proof -eq 'TaskSelector') { 'task-selector-proof.apk' } else { 'update-proof.apk' }
    $proofApk = Join-Path $evidence $proofName
    Copy-Item -LiteralPath $manifest.apk -Destination $proofApk
    $hashes = @{}
    foreach ($relative in $overrides.Keys) { $hashes[$relative] = (Get-FileHash -LiteralPath (Join-Path $checkout $relative) -Algorithm SHA256).Hash.ToLowerInvariant() }
    [ordered]@{ source_commit=$manifest.source_commit; fixture_source_commit=$fixtureSourceCommit; fixture_source_blob=$fixtureSourceBlob; fixture_source_sha256=$fixtureSourceSha256;
        namespace=$Namespace; mode=$Mode; proof=$Proof; test_only_overrides=$hashes;
        builder_sha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();
        apk_sha256=(Get-FileHash -LiteralPath $proofApk -Algorithm SHA256).Hash.ToLowerInvariant();
        normal_apk_sha256=$normalHash; normal_build_reused=[bool]$ReuseNormalBuild;
        boundary=if ($Proof -eq 'TaskSelector') { 'Synthetic local SQLite registry/journal and simulated selector JSON only; no live provider reads/writes, task capture, or normal app acceptance' } else { 'Historical/current production storage modules with explicit synthetic entry/fixture overrides; no ordinary app or provider acceptance' } } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'provenance.json') -Encoding utf8
} finally {
    foreach ($relative in $originals.Keys) {
        $target = Join-Path $checkout $relative
        if ($null -eq $originals[$relative]) { Remove-Item -LiteralPath $target }
        else { [IO.File]::WriteAllBytes($target,$originals[$relative]) }
    }
    Copy-Item -LiteralPath $normal -Destination $manifest.apk
    if (git -C $checkout status --porcelain) { throw 'Proof source restoration requires review.' }
}
Write-Output "Synthetic $Proof proof APK built; original source and normal Release APK restored. No release created."
