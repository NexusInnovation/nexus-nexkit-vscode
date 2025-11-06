# Azure Application Insights Setup for Nexkit Telemetry

This guide walks you through deploying Azure Application Insights infrastructure for the Nexkit VS Code extension telemetry.

## ⚠️ Privacy and Data Collection Notice

**IMPORTANT: This telemetry service collects Personally Identifiable Information (PII).**

### Data Collected

The Nexkit telemetry service automatically collects the following information with every telemetry event:

- **Username**: Operating system username (e.g., `john.doe`, `DOMAIN\user`)
- **IP Address**: Public IP address of the user's machine
- **Extension version**: Version of Nexkit extension installed
- **VS Code version**: Version of Visual Studio Code
- **Platform**: Operating system (Windows, macOS, Linux)
- **Session ID**: Unique identifier for each extension activation session
- **Command usage**: Commands executed and their success/failure status
- **Error information**: Exception details and stack traces

### Privacy Compliance

Before deploying this telemetry system, ensure you:

1. ✅ **Obtain User Consent**: Users must be informed about data collection and provide explicit consent
2. ✅ **Comply with Regulations**: Ensure compliance with:
   - GDPR (General Data Protection Regulation) for EU users
   - CCPA (California Consumer Privacy Act) for California users
   - Other applicable data protection laws in your jurisdiction
3. ✅ **Provide Opt-Out**: The extension respects VS Code's global telemetry settings and includes `nexkit.telemetry.enabled` configuration
4. ✅ **Document Data Usage**: Clearly communicate how collected data will be used, stored, and protected
5. ✅ **Implement Data Retention**: Configure appropriate data retention policies in Application Insights
6. ✅ **Secure Access**: Restrict access to telemetry data using Azure RBAC and implement proper authentication

### Recommended Use Cases

This PII-enabled telemetry configuration is suitable for:

- **Enterprise/Internal Deployments**: Organizations tracking extension usage within their environment
- **Security & Compliance Auditing**: Tracking who performs specific actions for audit trails
- **Support & Troubleshooting**: Identifying users who encounter issues for targeted support

### Alternative Approach (Non-PII)

For public/open-source distributions where PII collection is not appropriate:

1. Remove or hash username before sending to telemetry
2. Disable IP address tracking (Application Insights can still collect anonymized location data)
3. Use anonymous user identifiers instead of usernames

To disable PII tracking, modify `src/telemetryService.ts`:

- Remove `username` and `ipAddress` from `commonProperties`
- Use session-based or device-based anonymous identifiers instead

## Prerequisites

- Azure subscription with appropriate permissions
- Azure CLI installed and configured ([Install Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli))
- Logged into Azure CLI: `az login`

## Deployment Steps

### 1. Set Variables

Set your Azure subscription and resource group details:

```powershell
# PowerShell
$SUBSCRIPTION_ID = "<your-subscription-id>"
$RESOURCE_GROUP = "nexkit-telemetry-rg"
$LOCATION = "eastus"  # Change to your preferred region

az account set --subscription $SUBSCRIPTION_ID
```

```bash
# Bash
SUBSCRIPTION_ID="<your-subscription-id>"
RESOURCE_GROUP="nexkit-telemetry-rg"
LOCATION="eastus"  # Change to your preferred region

az account set --subscription $SUBSCRIPTION_ID
```

### 2. Create Resource Group

```bash
az group create --name $RESOURCE_GROUP --location $LOCATION
```

### 3. Deploy Bicep Template

#### Option A: Deploy with Default Parameters

```bash
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infrastructure/telemetry.bicep
```

#### Option B: Deploy with Custom Parameters File

Edit `infrastructure/telemetry.parameters.json` first, then:

```bash
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infrastructure/telemetry.bicep \
  --parameters infrastructure/telemetry.parameters.json
```

#### Option C: Deploy with Inline Parameters

```bash
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infrastructure/telemetry.bicep \
  --parameters location=eastus \
               applicationInsightsName=nexkit-appinsights \
               environment=prod
```

### 4. Retrieve Connection String

After deployment completes, get the Application Insights connection string:

```bash
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name telemetry \
  --query properties.outputs.connectionString.value \
  --output tsv
```

Or retrieve it directly from the resource:

```bash
APP_INSIGHTS_NAME=$(az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name telemetry \
  --query properties.outputs.applicationInsightsName.value \
  --output tsv)

az monitor app-insights component show \
  --app $APP_INSIGHTS_NAME \
  --resource-group $RESOURCE_GROUP \
  --query connectionString \
  --output tsv
```

### 5. Configure Extension

#### For Development

1. Copy the connection string from step 4
1. Create a `.env` file in the extension root (this file is gitignored):

```env
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=<your-key>;IngestionEndpoint=https://...
```

1. The extension will load this automatically during development

#### For Production/Distribution

**Important:** Never commit the connection string to the repository!

For published extensions, you have two options:

##### Option 1: User Configuration (Recommended for open-source)

- Users can optionally provide their own Application Insights connection string
- Add to VS Code settings: `nexkit.telemetry.connectionString`
- Most users will use your default connection string (stored securely)

##### Option 2: Build-time Injection

- Store connection string in GitHub Secrets or Azure Key Vault
- Inject during CI/CD build process
- Use environment variables during packaging

## Accessing Telemetry Data

### Azure Portal

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Go to your Resource Group: `nexkit-telemetry-rg`
3. Click on the Application Insights resource
4. Use the following features:

#### Overview Dashboard

- Quick view of request rates, response times, and failures
- Active users and sessions

#### Usage Analytics

- **Users**: Click "Users" under Usage to see active users over time
- **Events**: Click "Events" to see custom event tracking
- Filter by extension version in the custom properties

#### Logs (Kusto Query Language)

Click "Logs" to run custom queries:

**Active Users by Version:**

```kql
customEvents
| where timestamp > ago(30d)
| where name == "extension.activated"
| summarize Users=dcount(user_Id) by ExtensionVersion=tostring(customDimensions.extensionVersion)
| order by Users desc
```

**Command Usage by User:**

```kql
customEvents
| where timestamp > ago(7d)
| where name == "command.executed"
| summarize Count=count() by 
    Command=tostring(customDimensions.commandName),
    Username=tostring(customDimensions.username),
    IPAddress=tostring(customDimensions.ipAddress)
| order by Count desc
```

**Command Usage Summary:**

```kql
customEvents
| where timestamp > ago(7d)
| where name == "command.executed"
| summarize Count=count() by Command=tostring(customDimensions.commandName)
| order by Count desc
```

**User Activity by IP Address:**

```kql
customEvents
| where timestamp > ago(24h)
| summarize 
    Events=count(), 
    Commands=countif(name == "command.executed"),
    Errors=countif(name == "error")
by 
    Username=tostring(customDimensions.username),
    IPAddress=tostring(customDimensions.ipAddress)
| order by Events desc
```

**Real-time Active Sessions (last 5 minutes):**

```kql
customEvents
| where timestamp > ago(5m)
| where name == "extension.activated"
| summarize by session_Id
| count
```

**Error Tracking:**

```kql
exceptions
| where timestamp > ago(24h)
| project timestamp, problemId, outerMessage, customDimensions
| order by timestamp desc
```

### Create Alerts

Set up alerts for critical metrics:

1. In Application Insights, go to "Alerts"
2. Click "New alert rule"
3. Example: Alert when error rate exceeds threshold

## Cost Management

### Pricing

Application Insights uses pay-as-you-go pricing:

- **First 5 GB/month**: Free
- **Additional data**: ~$2.30/GB (prices vary by region)

For a typical VS Code extension:

- ~1-10 KB per user per day
- 1,000 daily active users ≈ 1-10 MB/day ≈ 0.3 GB/month (within free tier)

### Set Budget Alert

```bash
# Set a monthly budget alert
az consumption budget create \
  --resource-group $RESOURCE_GROUP \
  --budget-name nexkit-telemetry-budget \
  --amount 10 \
  --time-grain Monthly \
  --start-date $(date +%Y-%m-01) \
  --end-date 2026-12-31
```

## Troubleshooting

### No Data Appearing

1. Verify connection string is correctly set
2. Check telemetry is enabled: `nexkit.telemetry.enabled = true`
3. Wait 2-5 minutes for data ingestion
4. Check Application Insights "Live Metrics" for real-time data (see below)

## Live Metrics

The Nexkit extension is configured to send **live telemetry** to Azure Application Insights, allowing you to monitor extension activity in real-time with sub-second latency.

### Accessing Live Metrics

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Go to your Application Insights resource
3. In the left menu under **Investigate**, click **Live metrics**
4. You'll see real-time telemetry data as it happens:
   - **Request rate**: Command executions per second
   - **Failed requests**: Errors and exceptions
   - **Server metrics**: Performance counters
   - **Sample telemetry**: Live stream of events, traces, and exceptions

### What You'll See in Live Metrics

**Real-time Events:**

- Extension activation/deactivation
- Command executions (e.g., `nexkit-vscode.initProject`)
- Errors and exceptions with stack traces
- Custom events and metrics

**Performance Metrics:**

- Command execution duration
- Memory usage
- CPU utilization

**Sample Telemetry Stream:**

- Live event feed showing each telemetry item as it's sent
- Filter by event type, success/failure, or custom properties
- Inspect individual events for detailed information

### Use Cases for Live Metrics

1. **Development & Debugging**
   - See telemetry appear instantly during development
   - Validate that events are being tracked correctly
   - Debug telemetry issues in real-time

2. **Release Validation**
   - Monitor extension behavior immediately after publishing
   - Verify that new features are generating expected telemetry
   - Catch issues before they affect many users

3. **User Support**
   - Watch live telemetry while helping users troubleshoot issues
   - See exactly what commands they're executing
   - View error messages and stack traces in real-time

### Live Metrics Features

**No Additional Cost:** Live metrics streaming is completely free and doesn't count toward data ingestion quotas.

**Sub-Second Latency:** Telemetry appears within 1 second of being generated by the extension.

**Temporary Data:** Live metrics data is only displayed while the portal is open and is not persisted. For historical data, use Logs or Metrics Explorer.

### Troubleshooting Live Metrics

If live metrics aren't appearing:

1. **Verify Extension is Running**: Make sure VS Code with Nexkit is actively running
2. **Check Connection**: Ensure the connection string is configured correctly
3. **Generate Activity**: Execute some commands to generate telemetry
4. **Wait a Few Seconds**: First connection may take 5-10 seconds to establish
5. **Check SDK Version**: Ensure `applicationinsights` package is v1.3.0 or higher (current: 2.9.6)

### Connection Issues

1. Verify network allows outbound HTTPS to `dc.services.visualstudio.com`
2. Check firewall/proxy settings
3. Review VS Code extension logs

### Data Retention

- Default retention: 90 days
- Can be extended up to 730 days (may incur additional costs)
- Modify in Bicep template `retentionInDays` parameter

## Security Best Practices

1. ✅ Never commit connection strings to version control
2. ✅ Use managed identities when possible (future enhancement)
3. ✅ Restrict access to Application Insights resource using Azure RBAC
4. ✅ Enable IP masking (default in template)
5. ✅ Regularly review collected data for compliance

## Cleanup

To delete all resources:

```bash
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

## Additional Resources

- [Application Insights Documentation](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)
- [Kusto Query Language](https://learn.microsoft.com/en-us/azure/data-explorer/kusto/query/)
- [Application Insights Node.js SDK](https://github.com/microsoft/ApplicationInsights-node.js)
