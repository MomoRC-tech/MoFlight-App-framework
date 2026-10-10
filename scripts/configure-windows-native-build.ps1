param([string]$AndroidDirectory = 'apps/platform-lab/android')

$ErrorActionPreference = 'Stop'
$taskAndroid = (Resolve-Path -LiteralPath $AndroidDirectory).Path
$taskGradle = Join-Path $taskAndroid 'app/build.gradle'
if (-not (Test-Path -LiteralPath $taskGradle -PathType Leaf)) {
    throw 'Generate the Android project with Expo prebuild first.'
}
$taskText = [IO.File]::ReadAllText($taskGradle)
$taskMarker = '// MoFlight Windows native object paths'
if ($taskText.Contains($taskMarker)) {
    Write-Output 'Generated Windows native path settings already exist.'
    return
}
$taskHasher = [Security.Cryptography.SHA256]::Create()
try { $taskHash = ([BitConverter]::ToString($taskHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskAndroid)))).Replace('-','').Substring(0,8).ToLowerInvariant() }
finally { $taskHasher.Dispose() }
$taskCache = (Join-Path $env:LOCALAPPDATA "MoFlightBuild/cxx-$taskHash").Replace('\','/').Replace("'", "\'")
$taskBlock = @"

$taskMarker
android {
    defaultConfig {
        externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=250" } }
    }
    externalNativeBuild { cmake { buildStagingDirectory '$taskCache' } }
}
"@
[IO.File]::WriteAllText($taskGradle, $taskText + "`n" + $taskBlock, [Text.UTF8Encoding]::new($false))
Write-Output "Configured generated Android project; C++ cache: $taskCache"
