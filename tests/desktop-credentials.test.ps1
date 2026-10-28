#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\scripts\desktop-credentials.psm1') -Force
$testDirectory = Join-Path $env:TEMP ('moflight-credential-test-' + [guid]::NewGuid())
$path = Join-Path $testDirectory 'synthetic.json'
$password = $null
function Assert($condition, $message) { if (-not $condition) { throw $message } }
function Expect-Failure([scriptblock]$operation) {
    $failed = $false
    try { & $operation } catch { $failed = $true }
    Assert $failed 'An expected failure did not occur.'
}
try {
    Expect-Failure { Get-MoFlightCredential -Path $path }
    $password = ConvertTo-SecureString 'synthetic-only-Pass!42' -AsPlainText -Force
    $inputCredential = [pscredential]::new('synthetic-pilot', $password)
    Save-MoFlightCredential -Credential $inputCredential -Path $path
    $bytesBefore = [System.IO.File]::ReadAllText($path)
    Assert (-not $bytesBefore.Contains('synthetic-pilot')) 'Login name was stored in plaintext.'
    Assert (-not $bytesBefore.Contains('synthetic-only-Pass!42')) 'Password was stored in plaintext.'
    $actual = Get-MoFlightCredential -Path $path
    Assert ($actual.UserName -eq $inputCredential.UserName) 'Username round-trip failed.'
    Assert ($actual.GetNetworkCredential().Password -eq 'synthetic-only-Pass!42') 'Password round-trip failed.'
    $actual.Password.Dispose()
    Expect-Failure { Save-MoFlightCredential -Credential $inputCredential -Path $path }
    Assert ([System.IO.File]::ReadAllText($path) -eq $bytesBefore) 'Rejected overwrite modified the record.'
    Save-MoFlightCredential -Credential $inputCredential -Path $path -Replace
    $actual = Get-MoFlightCredential -Path $path
    Assert ($actual.UserName -eq 'synthetic-pilot') 'Explicit replacement failed.'
    $actual.Password.Dispose()
    $allowed = @([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')
    foreach ($target in @($testDirectory, $path)) {
        $acl = Get-Acl -LiteralPath $target
        Assert $acl.AreAccessRulesProtected 'ACL inheritance is enabled.'
        foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
            Assert ($rule.IdentityReference.Value -in $allowed) 'Unexpected principal has access.'
        }
    }
    [System.IO.File]::WriteAllText($path, '{invalid-synthetic-json')
    Expect-Failure { Get-MoFlightCredential -Path $path }
    $record = $bytesBefore | ConvertFrom-Json
    $record.password = 'invalid-dpapi-payload'
    [System.IO.File]::WriteAllText($path, ($record | ConvertTo-Json))
    Expect-Failure { Get-MoFlightCredential -Path $path }
    Write-Host 'PASS: synthetic round-trip, encrypted fields, missing/corrupt records, overwrite preservation/replacement and restricted ACLs.'
} finally {
    if ($null -ne $password) { $password.Dispose() }
    # Only the exact synthetic paths created above may be removed.
    if ([System.IO.File]::Exists($path)) { [System.IO.File]::Delete($path) }
    if ([System.IO.Directory]::Exists($testDirectory)) { [System.IO.Directory]::Delete($testDirectory, $false) }
}
