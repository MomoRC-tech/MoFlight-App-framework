#Requires -Version 5.1
[CmdletBinding()]
param([ValidateSet('Setup', 'Status')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'desktop-credentials.psm1') -Force
$path = Get-MoFlightCredentialPath
if ($Action -eq 'Setup') {
    $message = 'MoFlight desktop development: enter your Vereinsflieger login. Both fields will be encrypted for this Windows account. Cancel preserves any existing record.'
    $credential = Get-Credential -Message $message
    if ($null -eq $credential) { Write-Host 'Cancelled. No credential changed.'; return }
    try {
        Save-MoFlightCredential -Credential $credential -Replace
    } finally { $credential.Password.Dispose(); $credential = $null }
}
if (-not (Test-Path -LiteralPath $path)) { Write-Host 'No desktop credential is saved.'; return }
$check = Get-MoFlightCredential
try { Write-Host 'Desktop credential saved and decryptable. Login name and password are not displayed.' }
finally { $check.Password.Dispose(); $check = $null }
