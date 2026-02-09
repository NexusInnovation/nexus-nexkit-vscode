# Deploy Function Code
# This script builds and deploys the function code to Azure

param(
    [Parameter(Mandatory = $false)]
    [string]$FunctionAppName = "func-nexkit-badge-prod",

    [Parameter(Mandatory = $false)]
    [string]$ResourceGroup = "rg-nexkit"
)

Write-Host "Deploying Function Code..." -ForegroundColor Cyan
Write-Host "Function App: $FunctionAppName" -ForegroundColor Gray
Write-Host ""

# Check if in correct directory
if (-not (Test-Path "package.json")) {
    Write-Host "✗ package.json not found. Please run this script from the badge-service directory." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ npm install failed" -ForegroundColor Red
    exit 1
}

# Build TypeScript
Write-Host "Building TypeScript..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Build successful" -ForegroundColor Green
Write-Host ""

# Deploy to Azure
Write-Host "Publishing to Azure (this may take 1-2 minutes)..." -ForegroundColor Cyan
func azure functionapp publish $FunctionAppName --typescript

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Function code deployed successfully!" -ForegroundColor Green
Write-Host ""

# Get function app details
Write-Host "Getting function app details..." -ForegroundColor Cyan
$functionApp = az functionapp show `
    --name $FunctionAppName `
    --resource-group $ResourceGroup `
    --output json | ConvertFrom-Json

$functionAppUrl = "https://$($functionApp.defaultHostName)"

Write-Host ""
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "====================" -ForegroundColor Cyan
Write-Host "Function App URL: $functionAppUrl" -ForegroundColor White
Write-Host ""
Write-Host "Badge Endpoints:" -ForegroundColor Cyan
Write-Host "  Version: $functionAppUrl/api/version" -ForegroundColor White
Write-Host "  Release: $functionAppUrl/api/release" -ForegroundColor White
Write-Host ""
Write-Host "Test in browser or use curl:" -ForegroundColor Yellow
Write-Host "  curl $functionAppUrl/api/version" -ForegroundColor Gray
Write-Host "  curl $functionAppUrl/api/release" -ForegroundColor Gray
