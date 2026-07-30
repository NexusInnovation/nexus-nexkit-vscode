# Test fixture. Validation fails.
[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidDefaultValueSwitchParameter', '')]
param(
    [switch]$Interactive = $true,
    [string]$SettingsPath
)

Write-Output '::VALIDATED::false'
Write-Error 'fixture: validation failed'
exit 1
