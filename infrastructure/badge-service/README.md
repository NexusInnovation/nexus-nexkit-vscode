# Nexkit Badge Service

Azure Functions-based badge service for the private `nexus-nexkit-vscode` repository. This service generates dynamic SVG badges for displaying in README.md and other documentation.

## Features

- **Version Badge**: Displays current version from package.json
- **Release Badge**: Displays latest release information
- **Secure**: Uses Azure Key Vault for GitHub PAT storage
- **Cached**: 5-minute cache to respect GitHub API rate limits
- **Serverless**: Azure Functions consumption plan (pay-per-use)

## Architecture

```
GitHub (Private Repo)
    ↓
Azure Function App
    ├── Managed Identity
    ├── Key Vault Integration (GitHub PAT)
    └── Application Insights
    ↓
Badge Endpoints
    ├── /api/version
    └── /api/release
```

## Prerequisites

- **Azure CLI** installed and authenticated
- **Node.js 18+** installed
- **Azure Functions Core Tools** installed
- **Azure subscription** with appropriate permissions
- **GitHub Personal Access Token** with `repo` scope

## Local Development

### 1. Install Dependencies

```bash
cd infrastructure/badge-service
npm install
```

### 2. Configure Local Settings

Edit `local.settings.json`:

```json
{
  "Values": {
    "GITHUB_PAT": "your-github-pat-here",
    "GITHUB_OWNER": "NexusInnovation",
    "GITHUB_REPO": "nexus-nexkit-vscode",
    "CACHE_TTL_SECONDS": "300"
  }
}
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Start Local Function Runtime

```bash
npm start
```

### 5. Test Locally

Open in browser:
- Version badge: http://localhost:7071/api/version
- Release badge: http://localhost:7071/api/release

## Azure Deployment

### Step 1: Create GitHub PAT Secret in Key Vault

```powershell
.\scripts\create-keyvault-secret.ps1
```

Or manually:

```bash
az keyvault secret set \
  --vault-name kv-nexkit \
  --name github-pat-nexkit \
  --value "your-github-personal-access-token"
```

### Step 2: Deploy Infrastructure

```powershell
.\scripts\deploy-infrastructure.ps1
```

Or manually:

```bash
az deployment group create \
  --resource-group rg-nexkit \
  --template-file badge-service.bicep \
  --parameters badge-service.parameters.json
```

### Step 3: Deploy Function Code

```powershell
.\scripts\deploy-function.ps1
```

Or manually:

```bash
npm run build
func azure functionapp publish func-nexkit-badge-prod
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_PAT` | GitHub Personal Access Token (from Key Vault) | Required |
| `GITHUB_OWNER` | Repository owner | NexusInnovation |
| `GITHUB_REPO` | Repository name | nexus-nexkit-vscode |
| `CACHE_TTL_SECONDS` | Cache duration in seconds | 300 (5 minutes) |

### Key Vault Integration

The function app uses **Managed Identity** to access Key Vault:

1. System-assigned managed identity is automatically created during deployment
2. Identity is granted "Key Vault Secrets User" role
3. App Settings reference secrets using Key Vault URI syntax:
   ```
   @Microsoft.KeyVault(SecretUri=https://kv-nexkit.vault.azure.net/secrets/github-pat-nexkit/)
   ```

## API Endpoints

### GET /api/version

Returns SVG badge with current package version.

**Example:**
```
https://func-nexkit-badge-prod.azurewebsites.net/api/version
```

**Response:**
- Content-Type: `image/svg+xml`
- Cache-Control: `public, max-age=300`

### GET /api/release

Returns SVG badge with latest release information.

**Example:**
```
https://func-nexkit-badge-prod.azurewebsites.net/api/release
```

**Response:**
- Content-Type: `image/svg+xml`
- Cache-Control: `public, max-age=300`
- Color: Green for stable releases, orange for pre-releases

## Usage in README

Add to your README.md:

```markdown
![Version](https://func-nexkit-badge-prod.azurewebsites.net/api/version)
![Release](https://func-nexkit-badge-prod.azurewebsites.net/api/release)
```

## Monitoring

### Application Insights

View logs and metrics in Azure Portal:

```bash
az monitor app-insights component show \
  --app appi-nexkit-badge-prod \
  --resource-group rg-nexkit
```

### Live Metrics

Enable live metrics stream:

```bash
az webapp log tail \
  --name func-nexkit-badge-prod \
  --resource-group rg-nexkit
```

## Troubleshooting

### Badge Shows "unavailable"

1. Check Application Insights for errors
2. Verify GitHub PAT is valid and has `repo` scope
3. Verify Key Vault access is granted to Function App
4. Check if GitHub API rate limit is exceeded

### Authentication Errors

```bash
# Verify Key Vault secret exists
az keyvault secret show \
  --vault-name kv-nexkit \
  --name github-pat-nexkit

# Verify Function App has Managed Identity
az functionapp identity show \
  --name func-nexkit-badge-prod \
  --resource-group rg-nexkit

# Verify role assignment
az role assignment list \
  --assignee <principal-id> \
  --scope /subscriptions/93c3e352-3421-4d87-b96d-b297269a1d4d/resourceGroups/rg-nexkit/providers/Microsoft.KeyVault/vaults/kv-nexkit
```

### Cold Start Issues

If first request is slow (cold start), consider:
- Enabling "Always On" (requires Basic or higher plan)
- Pre-warming with scheduled health checks
- Accepting occasional cold starts with consumption plan

## Cost Estimation

**Azure Functions Consumption Plan:**
- First 1 million executions per month: **Free**
- Typical usage (1 request/min): ~43,200 executions/month
- Cost: **$0.00** (well within free tier)

**Storage Account:**
- Standard LRS: ~**$0.02/month**

**Total estimated cost: < $0.50/month**

## Security Best Practices

✅ GitHub PAT stored in Azure Key Vault  
✅ Managed Identity (no credentials in code)  
✅ HTTPS only  
✅ TLS 1.2 minimum  
✅ CORS configured  
✅ Public blob access disabled on storage  

## Development

### Project Structure

```
infrastructure/badge-service/
├── src/
│   ├── functions/          # Azure Function endpoints
│   │   ├── version.ts      # Version badge endpoint
│   │   └── release.ts      # Release badge endpoint
│   ├── services/           # Business logic
│   │   ├── githubService.ts
│   │   └── badgeGenerator.ts
│   └── utils/              # Utilities
│       ├── config.ts
│       ├── cache.ts
│       └── types.ts
├── scripts/                # Deployment scripts
├── badge-service.bicep     # Infrastructure as Code
├── package.json
└── tsconfig.json
```

### Adding New Badge Types

1. Create new TypeScript file in `src/functions/`
2. Implement Azure Function handler
3. Use `GitHubService` to fetch data
4. Use `BadgeGenerator` to create SVG
5. Build and deploy

## License

Internal use only - NexusInnovation/nexus-nexkit-vscode project.
