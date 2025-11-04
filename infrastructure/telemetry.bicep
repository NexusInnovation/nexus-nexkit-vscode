// Bicep template for deploying Azure Application Insights for Nexkit VS Code Extension telemetry

@description('The Azure region where resources will be deployed')
param location string = resourceGroup().location

@description('The name of the Application Insights resource')
@minLength(1)
@maxLength(255)
param applicationInsightsName string = 'nexkit-appinsights-${uniqueString(resourceGroup().id)}'

@description('The name of the Log Analytics Workspace')
@minLength(4)
@maxLength(63)
param logAnalyticsWorkspaceName string = 'nexkit-law-${uniqueString(resourceGroup().id)}'

@description('The type of application for Application Insights')
@allowed([
  'web'
  'other'
])
param applicationType string = 'other'

@description('The retention period in days for Application Insights data')
@minValue(30)
@maxValue(730)
param retentionInDays int = 90

@description('Environment tag for resource organization')
@allowed([
  'dev'
  'test'
  'prod'
])
param environment string = 'prod'

@description('Tags to apply to all resources')
param tags object = {
  Application: 'Nexkit VS Code Extension'
  ManagedBy: 'Bicep'
  Environment: environment
}

// Log Analytics Workspace - required for Application Insights
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018' // Pay-as-you-go pricing tier
    }
    retentionInDays: retentionInDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// Application Insights resource
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  kind: applicationType
  tags: tags
  properties: {
    Application_Type: applicationType
    WorkspaceResourceId: logAnalyticsWorkspace.id
    RetentionInDays: retentionInDays
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    DisableIpMasking: false // Mask IP addresses for privacy
  }
}

// Outputs
@description('The resource ID of the Application Insights instance')
output applicationInsightsId string = applicationInsights.id

@description('The instrumentation key for Application Insights (legacy)')
output instrumentationKey string = applicationInsights.properties.InstrumentationKey

@description('The connection string for Application Insights (recommended)')
output connectionString string = applicationInsights.properties.ConnectionString

@description('The Application Insights resource name')
output applicationInsightsName string = applicationInsights.name

@description('The Log Analytics Workspace ID')
output workspaceId string = logAnalyticsWorkspace.id
