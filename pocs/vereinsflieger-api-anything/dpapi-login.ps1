# Credentials are consumed in memory and sent only over a child process's anonymous stdin pipe.
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Import-Module (Join-Path $taskRoot 'scripts/desktop-credentials.psm1') -Force
$taskCredential = $null
$taskProcess = $null
$taskPacket = $null
$taskStage = 'credential-read'
try {
    $taskCredential = Get-MoFlightCredential
    $taskStage = 'node-resolution'
    $taskNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $taskStart = New-Object System.Diagnostics.ProcessStartInfo
    $taskStart.FileName = $taskNode
    $taskStart.Arguments = '--import tsx "' + (Join-Path $PSScriptRoot 'session-login.mjs') + '"'
    $taskStart.WorkingDirectory = $taskRoot
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    $taskStart.RedirectStandardInput = $true
    $taskStart.RedirectStandardOutput = $true
    $taskStart.RedirectStandardError = $true
    $taskProcess = New-Object System.Diagnostics.Process
    $taskProcess.StartInfo = $taskStart
    $taskStage = 'child-start'
    [void]$taskProcess.Start()
    $taskOutput = $taskProcess.StandardOutput.ReadToEndAsync()
    $taskErrors = $taskProcess.StandardError.ReadToEndAsync()
    $taskStage = 'credential-pipe'
    $taskPacket = @{ username = $taskCredential.UserName; password = $taskCredential.GetNetworkCredential().Password } | ConvertTo-Json -Compress
    $taskProcess.StandardInput.Write($taskPacket)
    $taskProcess.StandardInput.Close()
    $taskPacket = $null
    $taskCredential.Password.Dispose()
    $taskCredential = $null
    if (-not $taskProcess.WaitForExit(120000)) {
        $taskProcess.Kill()
        throw 'Local login timed out.'
    }
    $taskStage = 'child-result'
    $taskResult = $taskOutput.Result | ConvertFrom-Json
    # Fixed output fields only; never forward child stderr, HTML or arbitrary errors.
    [pscustomobject]@{ ok = [bool]$taskResult.ok; stage = [string]$taskResult.stage;
        sessionPromoted = [bool]$taskResult.sessionPromoted; submitted = [bool]$taskResult.submitted;
        flightRows = $taskResult.flightRows } | ConvertTo-Json -Compress
    if ($taskProcess.ExitCode -ne 0) { exit 1 }
} catch {
    [pscustomobject]@{ok=$false;stage=$taskStage;sessionPromoted=$false;errorType=$_.Exception.GetType().Name} | ConvertTo-Json -Compress
    exit 1
} finally {
    $taskPacket = $null
    if ($null -ne $taskCredential) { $taskCredential.Password.Dispose() }
    if ($null -ne $taskProcess) { $taskProcess.Dispose() }
}
