# Deployment Checklist

Use this checklist to deploy the Nexkit Badge Service to Azure.

## Pre-Deployment

- [ ] Azure CLI installed (`az --version`)
- [ ] Authenticated to Azure (`az login`)
- [ ] Correct subscription selected (`az account show`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Azure Functions Core Tools v4 installed (`func --version`)
- [ ] GitHub Personal Access Token created with `repo` scope

## Step 1: Prepare GitHub PAT

- [ ] Create GitHub PAT with `repo` scope (Settings → Developer settings → Personal access tokens)
- [ ] Copy token securely (you won't be able to see it again)
- [ ] Test token access:
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN" https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode
  ```

## Step 2: Store PAT in Key Vault

- [ ] Navigate to badge-service directory:
  ```powershell
  cd infrastructure/badge-service
  ```

- [ ] Run script to create secret:
  ```powershell
  .\scripts\create-keyvault-secret.ps1 -GitHubPAT "YOUR_TOKEN"
  ```

- [ ] Verify secret was created:
  ```bash
  az keyvault secret show --vault-name kv-nexkit --name github-pat-nexkit
  ```

## Step 3: Deploy Azure Infrastructure

- [ ] Review parameters in `badge-service.parameters.json`
- [ ] Update location if needed (default: canadacentral)
- [ ] Run deployment script:
  ```powershell
  .\scripts\deploy-infrastructure.ps1
  ```

- [ ] Wait for deployment to complete (3-5 minutes)
- [ ] Note the output URLs:
  - Function App URL: ___________________________
  - Version Badge URL: ___________________________
  - Release Badge URL: ___________________________

- [ ] Verify resources created:
  ```bash
  az resource list --resource-group rg-nexkit --output table
  ```

Expected resources:
- [ ] Function App: `func-nexkit-badge-prod`
- [ ] Storage Account: `stnexkitbadgeprod`
- [ ] App Service Plan: `asp-nexkit-badge-prod`
- [ ] Application Insights: `appi-nexkit-badge-prod`

## Step 4: Deploy Function Code

- [ ] Ensure you're in badge-service directory
- [ ] Install dependencies:
  ```bash
  npm install
  ```

- [ ] Build TypeScript:
  ```bash
  npm run build
  ```

- [ ] Verify build output in `dist/` directory
- [ ] Deploy to Azure:
  ```powershell
  .\scripts\deploy-function.ps1
  ```

- [ ] Wait for deployment to complete (1-2 minutes)

## Step 5: Test Badges

- [ ] Test version badge in browser:
  ```
  https://func-nexkit-badge-prod.azurewebsites.net/api/version
  ```

- [ ] Test release badge in browser:
  ```
  https://func-nexkit-badge-prod.azurewebsites.net/api/release
  ```

- [ ] Test with curl:
  ```bash
  curl https://func-nexkit-badge-prod.azurewebsites.net/api/version
  curl https://func-nexkit-badge-prod.azurewebsites.net/api/release
  ```

- [ ] Badges should return SVG content
- [ ] Badges should NOT show "unavailable" (if they do, check logs)

## Step 6: Verify Configuration

- [ ] Check Function App configuration:
  ```bash
  az functionapp config appsettings list \
    --name func-nexkit-badge-prod \
    --resource-group rg-nexkit
  ```

- [ ] Verify Key Vault reference is configured:
  - Look for `GITHUB_PAT` with `@Microsoft.KeyVault(...)` value

- [ ] Check Managed Identity:
  ```bash
  az functionapp identity show \
    --name func-nexkit-badge-prod \
    --resource-group rg-nexkit
  ```

- [ ] Verify role assignment on Key Vault:
  ```bash
  az role assignment list \
    --scope /subscriptions/93c3e352-3421-4d87-b96d-b297269a1d4d/resourceGroups/rg-nexkit/providers/Microsoft.KeyVault/vaults/kv-nexkit \
    --output table
  ```

## Step 7: Monitor and Validate

- [ ] Check Application Insights for logs:
  ```bash
  az monitor app-insights query \
    --app appi-nexkit-badge-prod \
    --resource-group rg-nexkit \
    --analytics-query "traces | where timestamp > ago(10m) | order by timestamp desc"
  ```

- [ ] Look for successful badge generation logs
- [ ] Check for any errors or warnings
- [ ] Verify cache is working (subsequent requests should be faster)

## Step 8: Update Repository

- [ ] Verify README.md has badge URLs (already updated!)
- [ ] Commit changes:
  ```bash
  git add .
  git commit -m "feat: add Azure Function badge service for version and release badges"
  ```

- [ ] Push to repository:
  ```bash
  git push
  ```

- [ ] View README on GitHub to see live badges

## Post-Deployment

- [ ] Document Function App URLs in team documentation
- [ ] Set up alerts in Application Insights (optional)
- [ ] Configure budget alerts for Azure resources (optional)
- [ ] Schedule review of logs after 24 hours

## Troubleshooting

### Badge shows "unavailable"

1. Check Function App logs:
   ```bash
   az webapp log tail --name func-nexkit-badge-prod --resource-group rg-nexkit
   ```

2. Verify GitHub PAT:
   ```bash
   # Test token manually
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/contents/package.json
   ```

3. Check Key Vault access:
   ```bash
   # Verify secret exists
   az keyvault secret show --vault-name kv-nexkit --name github-pat-nexkit
   
   # Check role assignments
   az role assignment list --assignee <function-app-principal-id>
   ```

### Deployment fails

1. Check Azure CLI is authenticated:
   ```bash
   az account show
   ```

2. Verify subscription and resource group:
   ```bash
   az group show --name rg-nexkit
   ```

3. Check Bicep template validation:
   ```bash
   az deployment group validate \
     --resource-group rg-nexkit \
     --template-file badge-service.bicep \
     --parameters badge-service.parameters.json
   ```

### Function App not responding

1. Check Function App status:
   ```bash
   az functionapp show --name func-nexkit-badge-prod --resource-group rg-nexkit --query "state"
   ```

2. Restart Function App:
   ```bash
   az functionapp restart --name func-nexkit-badge-prod --resource-group rg-nexkit
   ```

3. Check for cold start (first request may take 10-30 seconds)

## Success Criteria

✅ All resources deployed successfully  
✅ Function App has Managed Identity enabled  
✅ Managed Identity has access to Key Vault  
✅ Badges return valid SVG content  
✅ Badges show correct version and release info  
✅ No errors in Application Insights logs  
✅ README displays badges correctly on GitHub  

## Estimated Time

- Pre-deployment setup: 10 minutes
- Infrastructure deployment: 5 minutes
- Function code deployment: 3 minutes
- Testing and validation: 5 minutes
- **Total: ~25 minutes**

## Cost Estimate

- Azure Functions (Consumption): Free (within free tier)
- Storage Account: ~$0.02/month
- Application Insights: Free (within free tier)
- **Total: < $0.50/month**

---

**Deployment Date**: ________________  
**Deployed By**: ________________  
**Function App URL**: ________________  
**Notes**: ________________
