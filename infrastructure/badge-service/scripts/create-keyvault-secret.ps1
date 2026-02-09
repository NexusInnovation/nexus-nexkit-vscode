# Create Key Vault Secret for GitHub PAT
# This script creates the required secret in Azure Key Vault

param(
    [Parameter(Mandatory = $false)]
    [string]$KeyVaultName = "kv-nexkit",

    [Parameter(Mandatory = $false)]
    [string]$SecretName = "github-pat-nexkit",

    [Parameter(Mandatory = $true)]
    [string]$GitHubPAT
)

Write-Host "Creating secret in Key Vault..." -ForegroundColor Cyan

# Check if secret already exists
$existingSecret = az keyvault secret show --vault-name $KeyVaultName --name $SecretName 2>$null

if ($existingSecret) {
    Write-Host "Secret '$SecretName' already exists in Key Vault '$KeyVaultName'" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (y/N)"
    
    if ($overwrite -ne 'y' -and $overwrite -ne 'Y') {
        Write-Host "Operation cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Create or update the secret
az keyvault secret set `
    --vault-name $KeyVaultName `
    --name $SecretName `
    --value $GitHubPAT

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Secret created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Secret URI: https://$KeyVaultName.vault.azure.net/secrets/$SecretName/" -ForegroundColor Cyan
}
else {
    Write-Host "✗ Failed to create secret" -ForegroundColor Red
    exit 1
}
