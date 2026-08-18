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

@description('App Service Plan SKU. F1 (Free) needs no VM quota; B1 is the smallest dedicated tier.')
@allowed([
  'F1'
  'B1'
  'B2'
  'S1'
  'P0v3'
  'P1v3'
])
param appServicePlanSku string = 'F1'

@description('Node.js runtime version for the Linux Web App.')
param nodeVersion string = '22-lts'

@description('Optional API key. If set, API callers must send it via the x-api-key header. Leave empty to disable auth (demo).')
@secure()
param apiKey string = ''

@description('Optional Azure AI Foundry project endpoint that hosts the Predictive Maintenance Insights agent (projectEndpoint output of foundry-agent/infra/main.bicep). Leave empty to run POST /api/foundry/predict on the built-in heuristic.')
param foundryProjectEndpoint string = ''

@description('Optional Foundry agent name created by foundry-agent/scripts/create-agent.js (e.g. predictive-maintenance-insights).')
param foundryAgentName string = ''

@description('Max time in milliseconds to wait for a Foundry agent run before falling back to the heuristic score.')
param foundryTimeoutMs int = 45000

var foundryConfigured = !empty(foundryProjectEndpoint) && !empty(foundryAgentName)

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
      alwaysOn: (appServicePlanSku == 'F1' || appServicePlanSku == 'B1') ? false : true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appCommandLine: 'npm start'
      healthCheckPath: appServicePlanSku == 'F1' ? null : '/api/health'
      appSettings: concat([
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
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
      ], !foundryConfigured ? [] : [
        {
          name: 'FOUNDRY_PROJECT_ENDPOINT'
          value: foundryProjectEndpoint
        }
        {
          name: 'FOUNDRY_AGENT_NAME'
          value: foundryAgentName
        }
        {
          name: 'FOUNDRY_TIMEOUT_MS'
          value: string(foundryTimeoutMs)
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
output predictExample string = 'https://${webApp.properties.defaultHostName}/api/foundry/predict'
output appInsightsName string = appInsights.name

@description('Pass this to foundry-agent/infra/main.bicep as webAppPrincipalId so the app can call the Foundry agent with its managed identity.')
output webAppPrincipalId string = webApp.identity.principalId
