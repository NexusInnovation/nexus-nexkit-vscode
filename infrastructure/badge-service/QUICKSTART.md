# Quick Start: Deploy Badge Service

This guide walks you through deploying the Nexkit Badge Service to Azure in 3 simple steps.

## Prerequisites

✅ Azure CLI installed and authenticated (`az login`)  
✅ Node.js 18+ installed  
✅ Azure Functions Core Tools installed (`npm install -g azure-functions-core-tools@4`)  
✅ GitHub Personal Access Token with `repo` scope  

## Step 1: Create GitHub PAT Secret in Key Vault

Run PowerShell script:

```powershell
cd infrastructure/badge-service
.\scripts\create-keyvault-secret.ps1 -GitHubPAT "ghp_your_token_here"
```

Or manually with Azure CLI:

```bash
az keyvault secret set `
  --vault-name kv-nexkit `
  --name github-pat-nexkit `
  --value "ghp_your_token_here"
```

**⚠️ Important**: Your GitHub PAT needs `repo` scope to access private repositories.

## Step 2: Deploy Azure Infrastructure

Run PowerShell script:

```powershell
.\scripts\deploy-infrastructure.ps1
```

Or manually with Azure CLI:

```bash
az deployment group create `
  --resource-group rg-nexkit `
  --template-file badge-service.bicep `
  --parameters badge-service.parameters.json
```

This creates:
- ✅ Azure Function App (Consumption plan)
- ✅ Storage Account
- ✅ Application Insights
- ✅ Managed Identity with Key Vault access

**⏱️ Takes 3-5 minutes**

## Step 3: Deploy Function Code

Run PowerShell script:

```powershell
.\scripts\deploy-function.ps1
```

Or manually:

```bash
npm install
npm run build
func azure functionapp publish func-nexkit-badge-prod
```

**⏱️ Takes 1-2 minutes**

## Step 4: Test Your Badges

Open in browser:
- Version: `https://func-nexkit-badge-prod.azurewebsites.net/api/version`
- Release: `https://func-nexkit-badge-prod.azurewebsites.net/api/release`

Or use curl:

```bash
curl https://func-nexkit-badge-prod.azurewebsites.net/api/version
curl https://func-nexkit-badge-prod.azurewebsites.net/api/release
```

## Step 5: Add Badges to README

The main README.md is already updated with badge URLs! Just commit and push:

```bash
git add .
git commit -m "feat: add Azure Function badge service for version and release badges"
git push
```

## Troubleshooting

### "Secret not found" error

```bash
# Verify secret exists
az keyvault secret show --vault-name kv-nexkit --name github-pat-nexkit
```

### Badge shows "unavailable"

```bash
# Check function logs
az webapp log tail --name func-nexkit-badge-prod --resource-group rg-nexkit

# Check Application Insights
az monitor app-insights query `
  --app appi-nexkit-badge-prod `
  --resource-group rg-nexkit `
  --analytics-query "traces | where timestamp > ago(1h) | order by timestamp desc"
```

### Function App not found

```bash
# Verify deployment
az functionapp list --resource-group rg-nexkit --output table
```

## What's Next?

- ✅ Badges are live and cached for 5 minutes
- ✅ GitHub API calls are authenticated with your PAT
- ✅ Function App auto-scales based on demand
- ✅ Costs < $0.50/month (mostly free tier)

## Local Development

Want to test locally first?

```bash
cd infrastructure/badge-service

# Update local.settings.json with your GitHub PAT
npm install
npm run build
npm start

# Test locally
# http://localhost:7071/api/version
# http://localhost:7071/api/release
```

## Updating the Service

To update function code after changes:

```bash
npm run build
func azure functionapp publish func-nexkit-badge-prod
```

To update infrastructure:

```bash
az deployment group create `
  --resource-group rg-nexkit `
  --template-file badge-service.bicep ` 
  --parameters badge-service.parameters.json
```

---

**Questions?** See [README.md](./README.md) for full documentation.
