# Test fixture. Installs nothing; reports success.
[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidDefaultValueSwitchParameter', '')]
param(
    [switch]$Interactive = $true,
    [string]$SettingsPath
)

Write-Output 'fixture: setup complete'
exit 0
