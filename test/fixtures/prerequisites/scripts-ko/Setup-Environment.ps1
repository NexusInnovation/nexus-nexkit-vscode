# Test fixture. Setup fails without installing anything.
[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidDefaultValueSwitchParameter', '')]
param(
    [switch]$Interactive = $true,
    [string]$SettingsPath
)

Write-Error 'fixture: setup failed'
exit 1
