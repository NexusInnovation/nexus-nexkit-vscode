# Test fixture. Mimics a workspace whose prerequisites are not satisfied.
[CmdletBinding()]
param(
    [string]$SettingsPath
)

Write-Output 'fixture: checking'
Write-Output '::VALIDATED::false'
exit 1
