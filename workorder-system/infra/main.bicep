// =============================================================================
// Contoso Electronics - Equipment Work Order & Warranty System
// Azure App Service (Linux, Node.js) deployment
// =============================================================================
// Provisions:
//   - Log Analytics workspace
//   - Application Insights (workspace-based) for observability
//   - App Service Plan (Linux)
//   - Web App configured for Node.js with build-on-deploy enabled
//
// Deploy (resource group scope):
//   az group create -n rg-contoso-workorders -l eastus
//   az deployment group create \
//     -g rg-contoso-workorders \
//     -f infra/main.bicep \
//     -p infra/main.parameters.json
//
// Then publish the app code (from the workorder-system folder):
//   az webapp up (or) az webapp deploy --src-path <zip>
// See README.md for full steps.
// =============================================================================

@description('Base name used to derive resource names. Lowercase letters and numbers.')
@minLength(3)
@maxLength(20)
param appName string = 'contosowo'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('App Service Plan SKU. B1 is sufficient for the demo.')
@allowed([
  'B1'
  'B2'
  'S1'
  'P0v3'
  'P1v3'
])
param appServicePlanSku string = 'B1'

@description('Node.js runtime version for the Linux Web App.')
param nodeVersion string = '20-lts'

@description('Optional API key. If set, API callers must send it via the x-api-key header. Leave empty to disable auth (demo).')
@secure()
param apiKey string = ''

var suffix = uniqueString(resourceGroup().id)
var planName = 'plan-${appName}-${suffix}'
var webAppName = 'app-${appName}-${suffix}'
var logAnalyticsName = 'log-${appName}-${suffix}'
var appInsightsName = 'appi-${appName}-${suffix}'

// -----------------------------------------------------------------------------
// Observability
// -----------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// -----------------------------------------------------------------------------
// App Service Plan (Linux)
// -----------------------------------------------------------------------------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux
  }
}

// -----------------------------------------------------------------------------
// Web App
// -----------------------------------------------------------------------------
resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      alwaysOn: appServicePlanSku != 'B1' ? true : false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appCommandLine: 'npm start'
      healthCheckPath: '/api/health'
      appSettings: concat([
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
          value: '~3'
        }
        {
          name: 'WORKORDER_DATA_FILE'
          value: '/home/data/workorders.json'
        }
      ], empty(apiKey) ? [] : [
        {
          name: 'API_KEY'
          value: apiKey
        }
      ])
    }
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------
output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output apiBaseUrl string = 'https://${webApp.properties.defaultHostName}/api'
output warrantyCheckExample string = 'https://${webApp.properties.defaultHostName}/api/equipment/CE-OSC-1200/warranty'
output appInsightsName string = appInsights.name
