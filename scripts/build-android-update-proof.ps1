param(
    [Parameter(Mandatory)][string]$JavaHome,
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$SourceRef,
    [Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{0,30}$')][string]$Namespace,
    [Parameter(Mandatory)][ValidateSet('seed','verify')][string]$Mode
)
$ErrorActionPreference = 'Stop'
$evidence = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $evidence) { throw 'Use a new proof output directory; prior evidence is preserved.' }
New-Item -ItemType Directory -Path $evidence | Out-Null
& (Join-Path $PSScriptRoot 'build-android-local.ps1') -JavaHome $JavaHome -BuildDirectory $BuildDirectory -SourceRef $SourceRef
$checkout = [IO.Path]::GetFullPath($BuildDirectory)
if (git -C $checkout status --porcelain) { throw 'Preserve dirty build checkout.' }
$manifest = Get-Content -LiteralPath (Join-Path $checkout 'local-data/build-release.json') -Raw | ConvertFrom-Json
$normal = Join-Path $evidence 'normal-app.apk'
Copy-Item -LiteralPath $manifest.apk -Destination $normal
$root = Split-Path $PSScriptRoot -Parent
$overrides = @{
    'apps/platform-lab/index.ts' = "import { registerRootComponent } from 'expo';`nimport Proof, { configureUpdateProof } from './src/development/android-update-preservation-poc';`nconfigureUpdateProof('$Namespace','$Mode');`nregisterRootComponent(Proof);`n"
}
foreach ($relative in @('apps/platform-lab/src/development/update-preservation-fixture.ts','apps/platform-lab/src/development/android-update-preservation-poc.tsx')) {
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
    $proof = Join-Path $evidence 'update-proof.apk'
    Copy-Item -LiteralPath $manifest.apk -Destination $proof
    $hashes = @{}
    foreach ($relative in $overrides.Keys) { $hashes[$relative] = (Get-FileHash -LiteralPath (Join-Path $checkout $relative) -Algorithm SHA256).Hash.ToLowerInvariant() }
    [ordered]@{ source_commit=$manifest.source_commit; namespace=$Namespace; mode=$Mode; test_only_overrides=$hashes;
        apk_sha256=(Get-FileHash -LiteralPath $proof -Algorithm SHA256).Hash.ToLowerInvariant();
        boundary='Historical/current production storage modules with explicit synthetic entry/fixture overrides; no ordinary app or provider acceptance' } |
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
Write-Output 'Synthetic update proof built; original source and normal APK restored. No release created.'
