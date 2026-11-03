#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Setup', 'Status')][string]$Action = 'Status',
    [ValidatePattern('^[a-z0-9]{20}$')][string]$SupabaseProjectRef
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'desktop-credentials.psm1') -Force
$path = if ($SupabaseProjectRef) { Get-MoFlightCredentialPath -SupabaseProjectRef $SupabaseProjectRef } else { Get-MoFlightCredentialPath }
if ($Action -eq 'Setup') {
    $message = 'MoFlight desktop development: enter your Vereinsflieger login. Both fields will be encrypted for this Windows account. Cancel preserves any existing record.'
    $credential = if ($SupabaseProjectRef) {
        Get-Credential -UserName 'postgres' -Message "MoFlight Supabase database password for project $SupabaseProjectRef. Enter the existing password; this only stores it locally with Windows user-bound encryption. Cancel preserves any existing record."
    } else { Get-Credential -Message $message }
    if ($null -eq $credential) { Write-Host 'Cancelled. No credential changed.'; return }
    try {
        Save-MoFlightCredential -Credential $credential -Path $path -Replace
    } finally { $credential.Password.Dispose(); $credential = $null }
}
if (-not (Test-Path -LiteralPath $path)) { Write-Host 'No desktop credential is saved.'; return }
$check = Get-MoFlightCredential -Path $path
try { Write-Host 'Desktop credential saved and decryptable. Login name and password are not displayed.' }
finally { $check.Password.Dispose(); $check = $null }
