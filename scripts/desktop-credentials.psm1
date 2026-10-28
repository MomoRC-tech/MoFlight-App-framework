# Windows-only development helper. Never send returned credentials to tool output.
# Start-Process can inherit PowerShell 7 module paths when launching Windows
# PowerShell 5.1. Load host-matched built-ins before command autoload can pick
# incompatible modules (including duplicate security type definitions).
foreach ($builtIn in @('Microsoft.PowerShell.Security', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Management')) {
    Import-Module "$PSHOME\Modules\$builtIn\$builtIn.psd1" -Global -ErrorAction Stop
}
Set-StrictMode -Version Latest

function Get-MoFlightCredentialPath {
    if ($env:OS -ne 'Windows_NT') { throw 'This credential store requires Windows.' }
    Join-Path $env:LOCALAPPDATA 'MoFlight\secrets\vereinsflieger.dpapi.json'
}

function Set-MoFlightPrivateAcl {
    param([Parameter(Mandatory)][string]$Path)
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $isDirectory = [System.IO.Directory]::Exists($Path)
    $acl = if ($isDirectory) {
        [System.IO.Directory]::GetAccessControl($Path, [System.Security.AccessControl.AccessControlSections]::Access)
    } else {
        [System.IO.File]::GetAccessControl($Path, [System.Security.AccessControl.AccessControlSections]::Access)
    }
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existing in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existing) }
    foreach ($principal in @($sid, [System.Security.Principal.SecurityIdentifier]'S-1-5-18')) {
        $rule = if ([System.IO.Directory]::Exists($Path)) {
            New-Object System.Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
        } else {
            New-Object System.Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'Allow')
        }
        $acl.AddAccessRule($rule)
    }
    if ($isDirectory) { [System.IO.Directory]::SetAccessControl($Path, $acl) }
    else { [System.IO.File]::SetAccessControl($Path, $acl) }
}

function Save-MoFlightCredential {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][System.Management.Automation.PSCredential]$Credential,
        [string]$Path = (Get-MoFlightCredentialPath),
        [switch]$Replace
    )
    if ($env:OS -ne 'Windows_NT') { throw 'This credential store requires Windows.' }
    if ([string]::IsNullOrWhiteSpace($Credential.UserName) -or $Credential.Password.Length -eq 0) {
        throw 'Both login name and password are required.'
    }
    if ((Test-Path -LiteralPath $Path) -and -not $Replace) { throw 'A record already exists; replacement must be explicit.' }
    $directory = Split-Path -Parent $Path
    [void][System.IO.Directory]::CreateDirectory($directory)
    Set-MoFlightPrivateAcl $directory
    $temporary = Join-Path $directory ([guid]::NewGuid().ToString() + '.tmp')
    $secureName = ConvertTo-SecureString -String $Credential.UserName -AsPlainText -Force
    try {
        $record = @{
            version = 1
            username = ConvertFrom-SecureString -SecureString $secureName -ErrorAction Stop
            password = ConvertFrom-SecureString -SecureString $Credential.Password -ErrorAction Stop
        } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($temporary, $record)
        Set-MoFlightPrivateAcl $temporary
        if ([System.IO.File]::Exists($Path)) {
            if (-not $Replace) { throw 'A record already exists; replacement must be explicit.' }
            Set-MoFlightPrivateAcl $Path
            [System.IO.File]::Replace($temporary, $Path, [System.Management.Automation.Language.NullString]::Value)
        } else { [System.IO.File]::Move($temporary, $Path) }
    } finally {
        $secureName.Dispose()
        if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
    }
}

function Get-MoFlightCredential {
    [CmdletBinding()]
    param([string]$Path = (Get-MoFlightCredentialPath))
    if ($env:OS -ne 'Windows_NT') { throw 'This credential store requires Windows.' }
    if (-not [System.IO.File]::Exists($Path)) { throw 'No desktop credential is saved. Run desktop-credentials.ps1 -Action Setup.' }
    $secureName = $null
    try {
        $record = [System.IO.File]::ReadAllText($Path) | ConvertFrom-Json -ErrorAction Stop
        if ($record.version -ne 1) { throw 'Unsupported record.' }
        $secureName = ConvertTo-SecureString -String $record.username -ErrorAction Stop
        $password = ConvertTo-SecureString -String $record.password -ErrorAction Stop
        $name = [System.Net.NetworkCredential]::new('', $secureName).Password
        if ([string]::IsNullOrWhiteSpace($name) -or $password.Length -eq 0) { throw 'Empty credential.' }
        [System.Management.Automation.PSCredential]::new($name, $password)
    } catch {
        throw 'The desktop credential cannot be read under this Windows account. Re-enter it using Setup.'
    } finally {
        if ($null -ne $secureName) { $secureName.Dispose() }
    }
}

Export-ModuleMember -Function Get-MoFlightCredentialPath, Save-MoFlightCredential, Get-MoFlightCredential
