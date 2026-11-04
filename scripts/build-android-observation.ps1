param(
    [Parameter(Mandatory)][string]$JavaHome,
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$SourceRef,
    [string]$SourceRepository = (Split-Path $PSScriptRoot -Parent),
    [string]$SdkRoot = (Join-Path $env:LOCALAPPDATA 'Android/Sdk')
)

$ErrorActionPreference = 'Stop'

function Read-Git([string]$Directory, [string[]]$Arguments) {
    $result = & git -C $Directory @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Git source validation failed.' }
    return ($result -join "`n").Trim()
}

function Test-PathInside([string]$Path, [string]$Directory) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $fullDirectory = [IO.Path]::GetFullPath($Directory).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    return $fullPath.StartsWith($fullDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-PathInside([string]$Path, [string]$Directory) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not (Test-PathInside $fullPath $Directory)) { throw 'A build artifact path escapes the isolated checkout.' }
    return $fullPath
}

function Write-JsonFile([string]$Path, [object]$Value) {
    $json = ConvertTo-Json -InputObject $Value -Depth 12
    [IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}

function Get-ManifestDebuggable([string]$Path) {
    $xml = [Xml.XmlDocument]::new()
    $xml.XmlResolver = $null
    $xml.Load($Path)
    $application = $xml.SelectSingleNode('/manifest/application')
    if ($null -eq $application) { throw 'Packaged Android manifest has no application element.' }
    return $application.GetAttribute('debuggable', 'http://schemas.android.com/apk/res/android')
}

$source = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $SourceRepository).Path)
$checkout = [IO.Path]::GetFullPath($BuildDirectory)
$evidence = [IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path -LiteralPath $checkout -PathType Container)) { throw 'The normal build checkout does not exist.' }
if (-not (Test-Path -LiteralPath $JavaHome -PathType Container) -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw 'JavaHome does not contain bin/java.exe.' }
if (-not (Test-Path -LiteralPath $SdkRoot -PathType Container)) { throw 'Android SDK root does not exist.' }
if (Test-Path -LiteralPath $evidence) { throw 'Use a fresh observation output directory; prior evidence is preserved.' }
if ($checkout -eq $source -or (Test-PathInside $checkout $source)) { throw 'Use a separate build checkout outside the source repository.' }
if ((Test-PathInside $evidence $source) -or (Test-PathInside $evidence $checkout)) { throw 'Keep observation output outside the source repository and build checkout.' }
if (-not (Test-Path -LiteralPath (Join-Path $checkout '.git'))) { throw 'The selected build directory is not a Git checkout.' }

$resolvedSourceCommit = Read-Git $source @('rev-parse', "$SourceRef^{commit}")
$checkoutHead = Read-Git $checkout @('rev-parse', 'HEAD')
if ($checkoutHead -ne $resolvedSourceCommit) { throw 'The normal build checkout does not match the resolved source ref.' }
if (Read-Git $checkout @('status', '--porcelain')) { throw 'Preserve the dirty build checkout.' }
$origin = Read-Git $checkout @('remote', 'get-url', 'origin')
if ([IO.Path]::GetFullPath($origin) -ne $source) { throw 'The build checkout belongs to another source repository.' }

$buildManifestPath = Join-Path $checkout 'local-data/build-release.json'
if (-not (Test-Path -LiteralPath $buildManifestPath -PathType Leaf)) { throw 'The normal Release build manifest is missing.' }
$buildManifest = Get-Content -LiteralPath $buildManifestPath -Raw | ConvertFrom-Json
if ($buildManifest.configuration -ne 'Release' -or $buildManifest.source_commit -ne $resolvedSourceCommit) { throw 'Normal Release manifest source/configuration mismatch.' }
$normalApkPath = if ([IO.Path]::IsPathRooted([string]$buildManifest.apk)) { [string]$buildManifest.apk } else { Join-Path $checkout ([string]$buildManifest.apk) }
$normalApkPath = Assert-PathInside $normalApkPath $checkout
if (-not (Test-Path -LiteralPath $normalApkPath -PathType Leaf)) { throw 'The normal Release APK is missing.' }
$normalApkHash = (Get-FileHash -LiteralPath $normalApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($normalApkHash -ne ([string]$buildManifest.apk_sha256).ToLowerInvariant()) { throw 'Normal APK manifest hash mismatch.' }

$sourceRelative = 'apps/platform-lab/src/vereinsflieger/use-access-controller.tsx'
$sourcePath = Assert-PathInside (Join-Path $checkout $sourceRelative) $checkout
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'The ordinary app WebView source is missing.' }
$sourceOriginalBytes = [IO.File]::ReadAllBytes($sourcePath)
$sourceOriginalText = [IO.File]::ReadAllText($sourcePath)
$sourceBeforeHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
$oldProp = 'webviewDebuggingEnabled={false}'
$newProp = 'webviewDebuggingEnabled={true}'
if ([regex]::Matches($sourceOriginalText, [regex]::Escape($oldProp)).Count -ne 1) { throw 'Expected exactly one ordinary-app WebView debugging=false property.' }
$sourceOverlayText = $sourceOriginalText.Replace($oldProp, $newProp)
$sourceHasher = [Security.Cryptography.SHA256]::Create()
try { $sourceOverlayHash = [BitConverter]::ToString($sourceHasher.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($sourceOverlayText))).Replace('-', '').ToLowerInvariant() }
finally { $sourceHasher.Dispose() }

$manifestRelative = 'apps/platform-lab/android/app/build/intermediates/packaged_manifests/release/processReleaseManifestForPackage/AndroidManifest.xml'
$packagedManifestPath = Assert-PathInside (Join-Path $checkout $manifestRelative) $checkout
if (-not (Test-Path -LiteralPath $packagedManifestPath -PathType Leaf)) { throw 'The normal packaged Release manifest is missing; preserve the existing build outputs.' }
$manifestOriginalBytes = [IO.File]::ReadAllBytes($packagedManifestPath)
$manifestOriginalHash = (Get-FileHash -LiteralPath $packagedManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$normalManifestDebuggable = Get-ManifestDebuggable $packagedManifestPath
if ($normalManifestDebuggable -eq 'true') { throw 'The normal packaged Release manifest is already debuggable.' }

New-Item -ItemType Directory -Path $evidence | Out-Null

$manifestReportPath = Join-Path $evidence 'manifest-override.json'
$manifestReportBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($manifestReportPath))
$initScriptPath = Join-Path $evidence 'observation-manifest.init.gradle'
$initScript = @'
import groovy.json.JsonOutput
import java.security.MessageDigest
import javax.xml.parsers.DocumentBuilderFactory

def manifestReport = new File(new String(java.util.Base64.getDecoder().decode('__REPORT_PATH__'), 'UTF-8'))
def androidNamespace = 'http://schemas.android.com/apk/res/android'
def digest = { File file ->
    MessageDigest.getInstance('SHA-256').digest(file.bytes).collect { String.format('%02x', it & 0xff) }.join()
}
def parseManifest = { File file ->
    def factory = DocumentBuilderFactory.newInstance()
    factory.setNamespaceAware(true)
    factory.setFeature('http://apache.org/xml/features/disallow-doctype-decl', true)
    factory.setFeature('http://xml.org/sax/features/external-general-entities', false)
    factory.setFeature('http://xml.org/sax/features/external-parameter-entities', false)
    factory.setXIncludeAware(false)
    factory.setExpandEntityReferences(false)
    factory.newDocumentBuilder().parse(file)
}

gradle.projectsEvaluated {
    def app = gradle.rootProject.findProject(':app')
    if (app == null) {
        println('MoFlight observation manifest hook: no :app project in this Gradle build; skipping included build.')
        return
    }
    def processManifest = app.tasks.findByName('processReleaseManifestForPackage')
    if (processManifest == null) throw new GradleException('Expected processReleaseManifestForPackage task is missing.')
    def expectedDirectory = new File(app.buildDir, 'intermediates/packaged_manifests/release/processReleaseManifestForPackage').canonicalFile
    def manifestFile = new File(expectedDirectory, 'AndroidManifest.xml').canonicalFile
    def declaredOutputs = processManifest.outputs.files.files.collect { it.canonicalFile }
    if (!declaredOutputs.any { output -> manifestFile == output || manifestFile.path.startsWith(output.path + File.separator) }) {
        throw new GradleException('Observation manifest is not a declared output of processReleaseManifestForPackage.')
    }
    processManifest.outputs.upToDateWhen { false }
    processManifest.doLast {
        if (!manifestFile.isFile()) throw new GradleException('Packaged Release AndroidManifest.xml is missing.')
        def document = parseManifest(manifestFile)
        def applications = document.getElementsByTagName('application')
        if (applications.length != 1) throw new GradleException('Expected one application element in packaged manifest.')
        def application = applications.item(0)
        def beforeValue = application.getAttributeNS(androidNamespace, 'debuggable')
        if (beforeValue != '' && beforeValue != 'false') throw new GradleException('Refusing to override unexpected android:debuggable value.')

        def originalText = manifestFile.getText('UTF-8')
        def openings = (originalText =~ /(?s)<application\b[^>]*>/).findAll()
        if (openings.size() != 1) throw new GradleException('Could not isolate the packaged application start tag.')
        def opening = openings[0]
        def manifestHashBefore = digest(manifestFile)
        def attribute = java.util.regex.Pattern.compile("android:debuggable\\s*=\\s*(['\"])(.*?)\\1").matcher(opening)
        String changedOpening
        if (attribute.find()) {
            if (attribute.group(2) != 'false') throw new GradleException('Unexpected explicit android:debuggable value.')
            changedOpening = attribute.replaceFirst('android:debuggable="true"')
        } else {
            if (beforeValue != '') throw new GradleException('Unsupported Android namespace prefix for debuggable attribute.')
            changedOpening = opening.substring(0, opening.length() - 1) + ' android:debuggable="true">'
        }
        def changedText = originalText.replace(opening, changedOpening)
        manifestFile.setText(changedText, 'UTF-8')
        def changedDocument = parseManifest(manifestFile)
        def changedApplications = changedDocument.getElementsByTagName('application')
        if (changedApplications.length != 1 || changedApplications.item(0).getAttributeNS(androidNamespace, 'debuggable') != 'true') {
            throw new GradleException('Failed to set only the packaged application android:debuggable attribute.')
        }
        manifestReport.parentFile.mkdirs()
        manifestReport.setText(JsonOutput.prettyPrint(JsonOutput.toJson([
            task: processManifest.path,
            manifest_path: manifestFile.path,
            application_debuggable_before: beforeValue ?: 'absent (false)',
            application_debuggable_after: 'true',
            manifest_sha256_before: manifestHashBefore,
            manifest_sha256_after: digest(manifestFile)
        ])), 'UTF-8')
        println("MoFlight observation manifest override: ${manifestFile}")
    }
}
'@
$initScript = $initScript.Replace('__REPORT_PATH__', $manifestReportBase64)
[IO.File]::WriteAllText($initScriptPath, $initScript, [Text.UTF8Encoding]::new($false))
$normalBackupPath = Join-Path ([IO.Path]::GetTempPath()) ("moflight-observation-normal-$([guid]::NewGuid().ToString('N')).apk")
Copy-Item -LiteralPath $normalApkPath -Destination $normalBackupPath
if ((Get-FileHash -LiteralPath $normalBackupPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $normalApkHash) {
    Remove-Item -LiteralPath $normalBackupPath -Force -ErrorAction SilentlyContinue
    throw 'Normal APK backup hash mismatch.'
}

$environmentNames = @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'NODE_ENV', 'EXPO_PUBLIC_MOFLIGHT_SOURCE', 'PATH')
$oldEnvironment = @{}
foreach ($name in $environmentNames) { $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$sourceOverlayWritten = $false
$manifestOverrideReport = $null
$provenancePath = Join-Path $evidence 'provenance.json'
$buildStatusPath = Join-Path $evidence 'build-status.json'
$provenance = $null
$buildSucceeded = $false

try {
    Write-JsonFile (Join-Path $evidence 'override-plan.json') ([ordered]@{
        kind = 'local-android-observation-only'
        source_commit = $resolvedSourceCommit
        normal_apk_sha256 = $normalApkHash
        source_overlay = [ordered]@{ path = $sourceRelative; replace = $oldProp; with = $newProp; original_sha256 = $sourceBeforeHash; overlay_sha256 = $sourceOverlayHash }
        native_manifest_overlay = [ordered]@{ gradle_task = ':app:processReleaseManifestForPackage'; output = $manifestRelative; change = 'android:debuggable absent/false -> true'; original_sha256 = $manifestOriginalHash }
        release_build_type_and_build_config_override = $false
        metro_or_dev_server = $false
        publication = 'forbidden; local observation APK only'
    })

    $sourceOverlayWritten = $true
    [IO.File]::WriteAllText($sourcePath, $sourceOverlayText, [Text.UTF8Encoding]::new($false))
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $SdkRoot
    $env:ANDROID_SDK_ROOT = $SdkRoot
    $env:NODE_ENV = 'production'
    $env:EXPO_PUBLIC_MOFLIGHT_SOURCE = $resolvedSourceCommit
    $env:PATH = "$JavaHome/bin;$env:PATH"
    if ((& node --version) -notmatch '^v24\.') { throw 'Use the repository Node 24 baseline for the observation bundle.' }

    Push-Location (Join-Path $checkout 'apps/platform-lab/android')
    try {
        & ./gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --init-script $initScriptPath *> (Join-Path $evidence 'observation-build.log')
        if ($LASTEXITCODE -ne 0) { throw 'Observation Release build failed; see observation-build.log.' }
    } finally { Pop-Location }

    if (-not (Test-Path -LiteralPath $manifestReportPath -PathType Leaf)) { throw 'Gradle did not record its packaged-manifest override.' }
    $manifestOverrideReport = Get-Content -LiteralPath $manifestReportPath -Raw | ConvertFrom-Json
    $manifestAfterHash = (Get-FileHash -LiteralPath $packagedManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($manifestOverrideReport.manifest_path -ne $packagedManifestPath -or $manifestOverrideReport.application_debuggable_after -ne 'true' -or $manifestOverrideReport.manifest_sha256_after -ne $manifestAfterHash) {
        throw 'Packaged Release manifest override provenance does not match the task output.'
    }
    if ((Get-ManifestDebuggable $packagedManifestPath) -ne 'true') { throw 'Packaged observation manifest is not debuggable.' }
    Copy-Item -LiteralPath $packagedManifestPath -Destination (Join-Path $evidence 'packaged-observation-AndroidManifest.xml')

    $buildConfigRoot = Join-Path $checkout 'apps/platform-lab/android/app/build/generated/source/buildConfig/release'
    $buildConfigFiles = @(Get-ChildItem -LiteralPath $buildConfigRoot -Filter BuildConfig.java -File -Recurse -ErrorAction SilentlyContinue)
    $debugConfigFiles = @($buildConfigFiles | Where-Object { [regex]::IsMatch([IO.File]::ReadAllText($_.FullName), 'public\s+static\s+final\s+boolean\s+DEBUG\s*=') })
    if ($debugConfigFiles.Count -ne 1) { throw 'Could not identify exactly one Release BuildConfig.DEBUG field.' }
    $buildConfigText = [IO.File]::ReadAllText($debugConfigFiles[0].FullName)
    if ([regex]::Matches($buildConfigText, 'public\s+static\s+final\s+boolean\s+DEBUG\s*=\s*false\s*;').Count -ne 1 -or [regex]::IsMatch($buildConfigText, 'public\s+static\s+final\s+boolean\s+DEBUG\s*=\s*true\s*;')) {
        throw 'Release BuildConfig.DEBUG must remain false in the observation build.'
    }

    $observationApk = Join-Path $evidence 'observation-only.apk'
    Copy-Item -LiteralPath $normalApkPath -Destination $observationApk
    $observationApkHash = (Get-FileHash -LiteralPath $observationApk -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($observationApkHash -eq $normalApkHash) { throw 'Observation APK hash matches the untouched normal APK.' }
    $provenance = [ordered]@{
        kind = 'local-android-observation-only'
        source_ref = $SourceRef
        source_commit = $resolvedSourceCommit
        normal_apk_sha256 = $normalApkHash
        observation_apk = 'observation-only.apk'
        observation_apk_sha256 = $observationApkHash
        source_overlay = [ordered]@{ path = $sourceRelative; from = $oldProp; to = $newProp; original_sha256 = $sourceBeforeHash; overlay_sha256 = $sourceOverlayHash }
        native_manifest_overlay = [ordered]@{ task = $manifestOverrideReport.task; path = $manifestRelative; absolute_path = $manifestOverrideReport.manifest_path; debuggable_before = $manifestOverrideReport.application_debuggable_before; debuggable_after = $manifestOverrideReport.application_debuggable_after; sha256_before_override = $manifestOverrideReport.manifest_sha256_before; sha256_after_override = $manifestOverrideReport.manifest_sha256_after }
        release_build_config = [ordered]@{ debug = $false; path = $debugConfigFiles[0].FullName; sha256 = (Get-FileHash -LiteralPath $debugConfigFiles[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
        gradle_init_script_sha256 = (Get-FileHash -LiteralPath $initScriptPath -Algorithm SHA256).Hash.ToLowerInvariant()
        builder_sha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
        publish = $false
        boundary = 'Ordinary app Release bundle with WebView debugging enabled and packaged manifest debuggable for local observation. No alternate entry point, BuildConfig.DEBUG change, Metro server, device action, or release publishing.'
    }
    Write-JsonFile $provenancePath $provenance
    $buildSucceeded = $true
    Write-JsonFile $buildStatusPath ([ordered]@{ status = 'built'; observation_apk_sha256 = $observationApkHash })
} catch {
    Write-JsonFile $buildStatusPath ([ordered]@{ status = 'failed'; error = $_.Exception.Message })
    throw
} finally {
    $restoreErrors = @()
    try {
        if ($sourceOverlayWritten) { [IO.File]::WriteAllBytes($sourcePath, $sourceOriginalBytes) }
        if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceBeforeHash) { throw 'Source file hash differs after restoration.' }
    } catch { $restoreErrors += "Source restore: $($_.Exception.Message)" }
    try {
        [IO.File]::WriteAllBytes($packagedManifestPath, $manifestOriginalBytes)
        if ((Get-FileHash -LiteralPath $packagedManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifestOriginalHash) { throw 'Packaged manifest hash differs after restoration.' }
    } catch { $restoreErrors += "Packaged manifest restore: $($_.Exception.Message)" }
    try {
        Copy-Item -LiteralPath $normalBackupPath -Destination $normalApkPath -Force
        if ((Get-FileHash -LiteralPath $normalApkPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $normalApkHash) { throw 'Normal APK hash differs after restoration.' }
    } catch { $restoreErrors += "Normal APK restore: $($_.Exception.Message)" }
    try {
        if (Read-Git $checkout @('status', '--porcelain')) { throw 'Build checkout source restoration requires review.' }
    } catch { $restoreErrors += "Checkout cleanliness: $($_.Exception.Message)" }
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process') }

    $sourceRestoreFailed = @($restoreErrors | Where-Object { $_ -like 'Source restore:*' }).Count -gt 0
    $manifestRestoreFailed = @($restoreErrors | Where-Object { $_ -like 'Packaged manifest restore:*' }).Count -gt 0
    $apkRestoreFailed = @($restoreErrors | Where-Object { $_ -like 'Normal APK restore:*' }).Count -gt 0
    $checkoutRestoreFailed = @($restoreErrors | Where-Object { $_ -like 'Checkout cleanliness:*' }).Count -gt 0
    $restoration = [ordered]@{ source_restored = (-not $sourceRestoreFailed); packaged_manifest_restored = (-not $manifestRestoreFailed); normal_apk_restored = (-not $apkRestoreFailed); checkout_clean = (-not $checkoutRestoreFailed); errors = $restoreErrors }
    if ($restoreErrors.Count -eq 0) {
        try { Remove-Item -LiteralPath $normalBackupPath -Force -ErrorAction Stop }
        catch { $restoreErrors += "Temporary backup cleanup: $($_.Exception.Message)" }
    } else {
        $restoration['normal_backup_retained_at'] = $normalBackupPath
    }
    $restoration['errors'] = $restoreErrors
    Write-JsonFile (Join-Path $evidence 'restoration-status.json') $restoration
    if (Test-Path -LiteralPath $provenancePath) {
        $savedProvenance = Get-Content -LiteralPath $provenancePath -Raw | ConvertFrom-Json
        $savedProvenance | Add-Member -MemberType NoteProperty -Name restoration -Value $restoration -Force
        Write-JsonFile $provenancePath $savedProvenance
    }
    if ($restoreErrors.Count -gt 0) { throw ('Observation build restoration failed: ' + ($restoreErrors -join '; ') + "; normal APK backup retained at $normalBackupPath") }
}

if ($buildSucceeded) { Write-Output "Observation-only APK created at $evidence\observation-only.apk; original source, packaged manifest and normal Release APK restored. Do not publish." }
