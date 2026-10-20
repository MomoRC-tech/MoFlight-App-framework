param(
    [Parameter(Mandatory)][string]$JavaHome,
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$SourceRef = 'HEAD',
    [ValidateSet('Recovery', 'Responsiveness')][string]$Proof = 'Recovery'
)

$ErrorActionPreference = 'Stop'
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
$module = if ($Proof -eq 'Responsiveness') { 'android-flight-responsiveness-poc' } else { 'android-core-recovery-poc' }
$override = "import { registerRootComponent } from 'expo';`nimport ProofComponent from './src/development/$module';`nregisterRootComponent(ProofComponent);`n"
$overrideBytes = [Text.UTF8Encoding]::new($false).GetBytes($override)
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NODE_ENV = 'production'
$env:PATH = "$JavaHome/bin;$env:PATH"
try {
    [IO.File]::WriteAllBytes($entry, $overrideBytes)
    Push-Location (Join-Path $checkout 'apps/platform-lab/android')
    try {
        & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 *> (Join-Path $evidence 'proof-build.log')
        if ($LASTEXITCODE) { throw 'Recovery proof build failed.' }
    } finally { Pop-Location }
    $proofName = if ($Proof -eq 'Recovery') { 'core-recovery-poc.apk' } else { 'flight-responsiveness-poc.apk' }
    $proofApk = Join-Path $evidence $proofName
    Copy-Item -LiteralPath $manifest.apk -Destination $proofApk
    [IO.File]::WriteAllText((Join-Path $evidence 'entry-override.ts'), $override)
    $provenance = [ordered]@{
        kind = if ($Proof -eq 'Recovery') { 'synthetic-android-process-death-poc' } else { $module }
        source_commit = $manifest.source_commit
        entry_override = $override
        proof_apk_sha256 = (Get-FileHash -LiteralPath $proofApk -Algorithm SHA256).Hash.ToLowerInvariant()
        normal_apk_sha256 = $manifest.apk_sha256
        boundary = 'Test entry override; not normal-app or physical power-loss acceptance'
    }
    $provenance | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'provenance.json') -Encoding utf8
} finally {
    [IO.File]::WriteAllBytes($entry, $original)
    Copy-Item -LiteralPath $normal -Destination $manifest.apk
    if (git -C $checkout status --porcelain) { throw 'Build checkout source restoration requires review.' }
}
Write-Output 'Proof built; original entry and normal Release artifact restored. No device action performed.'
