# Deploy Badge Service Infrastructure
# This script deploys the Azure infrastructure using Bicep

param(
    [Parameter(Mandatory = $false)]
    [string]$ResourceGroup = "rg-nexkit",

    [Parameter(Mandatory = $false)]
    [string]$SubscriptionId = "93c3e352-3421-4d87-b96d-b297269a1d4d",

    [Parameter(Mandatory = $false)]
    [string]$TemplateFile = "badge-service.bicep",

    [Parameter(Mandatory = $false)]
    [string]$ParametersFile = "badge-service.parameters.json"
)

Write-Host "Deploying Badge Service Infrastructure..." -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Gray
Write-Host "Subscription: $SubscriptionId" -ForegroundColor Gray
Write-Host ""

# Set subscription context
Write-Host "Setting subscription context..." -ForegroundColor Cyan
az account set --subscription $SubscriptionId

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to set subscription context" -ForegroundColor Red
    exit 1
}

# Validate Bicep template
Write-Host "Validating Bicep template..." -ForegroundColor Cyan
az deployment group validate `
    --resource-group $ResourceGroup `
    --template-file $TemplateFile `
    --parameters $ParametersFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Template validation failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Template validation passed" -ForegroundColor Green
Write-Host ""

# Deploy infrastructure
Write-Host "Deploying infrastructure (this may take 3-5 minutes)..." -ForegroundColor Cyan
$deployment = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file $TemplateFile `
    --parameters $ParametersFile `
    --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Infrastructure deployed successfully!" -ForegroundColor Green
Write-Host ""

# Display outputs
Write-Host "Deployment Outputs:" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host "Function App Name: $($deployment.properties.outputs.functionAppName.value)" -ForegroundColor White
Write-Host "Function App URL: $($deployment.properties.outputs.functionAppUrl.value)" -ForegroundColor White
Write-Host "Version Badge URL: $($deployment.properties.outputs.versionBadgeUrl.value)" -ForegroundColor White
Write-Host "Release Badge URL: $($deployment.properties.outputs.releaseBadgeUrl.value)" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Run .\scripts\deploy-function.ps1 to deploy the function code" -ForegroundColor Gray
Write-Host "2. Test the endpoints using the URLs above" -ForegroundColor Gray
