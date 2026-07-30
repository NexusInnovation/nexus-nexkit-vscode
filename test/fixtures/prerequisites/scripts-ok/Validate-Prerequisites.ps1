# Test fixture. Declares -Interactive so the extension's switch is accepted.
# The default-true switch mirrors the real Validate-Prerequisites.ps1 contract,
# which is exactly what this fixture exists to exercise.
[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidDefaultValueSwitchParameter', '')]
param(
    [switch]$Interactive = $true,
    [string]$SettingsPath
)

Write-Output "fixture: interactive=$($Interactive.IsPresent -and $Interactive)"
Write-Output 'fixture: validating'
Write-Output '::VALIDATED::true'
exit 0
