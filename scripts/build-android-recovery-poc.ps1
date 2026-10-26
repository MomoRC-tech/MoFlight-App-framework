param(
    [Parameter(Mandatory)][string]$JavaHome,
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$SourceRef = 'HEAD',
    [ValidateSet('Recovery', 'Responsiveness', 'Network', 'SyncBenchmark', 'SyncProgress')][string]$Proof = 'Recovery',
    [string]$HarnessSourceRef,
    [ValidatePattern('^[a-z][a-z0-9-]{0,39}$')][string]$RecoveryNamespace
)

$ErrorActionPreference = 'Stop'
if ($RecoveryNamespace -and $Proof -ne 'Recovery') { throw 'A recovery namespace requires the Recovery proof.' }
$evidence = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $evidence) { throw 'Use a new output directory; prior evidence is preserved.' }
New-Item -ItemType Directory -Path $evidence | Out-Null
& (Join-Path $PSScriptRoot 'build-android-local.ps1') -JavaHome $JavaHome -BuildDirectory $BuildDirectory -SourceRef $SourceRef
$checkout = [IO.Path]::GetFullPath($BuildDirectory)
if (git -C $checkout status --porcelain) { throw 'Preserve dirty build checkout.' }
$manifest = Get-Content -LiteralPath (Join-Path $checkout 'local-data/build-release.json') -Raw | ConvertFrom-Json
$normal = Join-Path $evidence 'normal-app.apk'
Copy-Item -LiteralPath $manifest.apk -Destination $normal
if ((Get-FileHash -LiteralPath $normal -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.apk_sha256) { throw 'Normal APK manifest mismatch.' }
$entry = Join-Path $checkout 'apps/platform-lab/index.ts'
$original = [IO.File]::ReadAllBytes($entry)
$module = switch ($Proof) { 'Responsiveness' { 'android-flight-responsiveness-poc' } 'Network' { 'android-network-poc' } 'SyncBenchmark' { 'android-sync-benchmark-poc' } 'SyncProgress' { 'android-sync-progress-poc' } default { 'android-core-recovery-poc' } }
$harnessBackups = @{}
if ($HarnessSourceRef -and $Proof -ne 'SyncBenchmark') { throw 'Historical harness overlay is restricted to the isolated Sync benchmark.' }
$androidManifest = Join-Path $checkout 'apps/platform-lab/android/app/src/main/AndroidManifest.xml'
$originalManifest = [IO.File]::ReadAllBytes($androidManifest)
$override = "import { registerRootComponent } from 'expo';`nimport ProofComponent from './src/development/$module';`nregisterRootComponent(ProofComponent);`n"
if ($RecoveryNamespace) {
    $override = "import { registerRootComponent } from 'expo';`nimport ProofComponent, { setRecoveryNamespace } from './src/development/$module';`nsetRecoveryNamespace('$RecoveryNamespace');`nregisterRootComponent(ProofComponent);`n"
}
$overrideBytes = [Text.UTF8Encoding]::new($false).GetBytes($override)
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NODE_ENV = 'production'
$env:PATH = "$JavaHome/bin;$env:PATH"
try {
    if ($HarnessSourceRef) {
        foreach ($relative in @('apps/platform-lab/src/development/sync-native-benchmark.ts', 'apps/platform-lab/src/development/android-sync-benchmark-poc.tsx')) {
            $target = [IO.Path]::GetFullPath((Join-Path $checkout $relative))
            if (-not $target.StartsWith($checkout + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Harness path escapes build checkout.' }
            $content = git -C (Split-Path $PSScriptRoot -Parent) show "${HarnessSourceRef}:$relative"
            if ($LASTEXITCODE) { throw 'Cannot read committed benchmark harness.' }
            $harnessBackups[$target] = if (Test-Path -LiteralPath $target) { [IO.File]::ReadAllBytes($target) } else { $null }
            [IO.File]::WriteAllText($target, ($content -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
        }
    }
    [IO.File]::WriteAllBytes($entry, $overrideBytes)
    if ($Proof -eq 'Network') {
        # Local HTTP is allowed in this fixture APK only; production manifest is restored.
        $manifestText = [Text.Encoding]::UTF8.GetString($originalManifest)
        if ($manifestText -match 'android:usesCleartextTraffic=') { throw 'Review existing cleartext policy before overriding it.' }
        [IO.File]::WriteAllText($androidManifest, $manifestText.Replace('<application ', '<application android:usesCleartextTraffic="true" '), [Text.UTF8Encoding]::new($false))
    }
    Push-Location (Join-Path $checkout 'apps/platform-lab/android')
    try {
        & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 *> (Join-Path $evidence 'proof-build.log')
        if ($LASTEXITCODE) { throw 'Recovery proof build failed.' }
    } finally { Pop-Location }
    $proofName = switch ($Proof) { 'Recovery' { 'core-recovery-poc.apk' } 'Network' { 'network-poc.apk' } 'SyncBenchmark' { 'sync-benchmark-poc.apk' } 'SyncProgress' { 'sync-progress-poc.apk' } default { 'flight-responsiveness-poc.apk' } }
    $proofApk = Join-Path $evidence $proofName
    Copy-Item -LiteralPath $manifest.apk -Destination $proofApk
    [IO.File]::WriteAllText((Join-Path $evidence 'entry-override.ts'), $override)
    $provenance = [ordered]@{
        kind = if ($Proof -eq 'Recovery') { 'synthetic-android-process-death-poc' } else { $module }
        source_commit = $manifest.source_commit
        harness_source_commit = $HarnessSourceRef
        entry_override = $override
        test_only_cleartext = ($Proof -eq 'Network')
        recovery_namespace = $RecoveryNamespace
        proof_apk_sha256 = (Get-FileHash -LiteralPath $proofApk -Algorithm SHA256).Hash.ToLowerInvariant()
        normal_apk_sha256 = $manifest.apk_sha256
        boundary = 'Test entry override; not normal-app or physical power-loss acceptance'
    }
    $provenance | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'provenance.json') -Encoding utf8
} finally {
    foreach ($target in $harnessBackups.Keys) {
        if ($null -eq $harnessBackups[$target]) { [IO.File]::Delete($target) }
        else { [IO.File]::WriteAllBytes($target, $harnessBackups[$target]) }
    }
    [IO.File]::WriteAllBytes($entry, $original)
    [IO.File]::WriteAllBytes($androidManifest, $originalManifest)
    Copy-Item -LiteralPath $normal -Destination $manifest.apk
    if (git -C $checkout status --porcelain) { throw 'Build checkout source restoration requires review.' }
}
Write-Output 'Proof built; original entry and normal Release artifact restored. No device action performed.'
