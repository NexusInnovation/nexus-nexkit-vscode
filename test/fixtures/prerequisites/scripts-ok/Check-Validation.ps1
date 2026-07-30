# Test fixture. Mimics the contract of the real check script.
# Deliberately declares no -Interactive switch, exactly like Check-Validation.ps1.
[CmdletBinding()]
param(
    [string]$SettingsPath
)

Write-Output 'fixture: checking'
Write-Output '::VALIDATED::true'
exit 0
