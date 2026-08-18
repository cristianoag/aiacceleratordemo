// =============================================================================
// Contoso Electronics - Predictive Maintenance Insights (Azure AI Foundry)
// =============================================================================
// Provisions:
//   - Azure AI Foundry resource (Cognitive Services account, kind 'AIServices',
//     with project management enabled)
//   - A model deployment used by the Foundry Agent Service agent
//   - An Azure AI Foundry project that hosts the agent
//   - (Optional) 'Foundry User' role assignment for the Work Order & Warranty
//     System App Service managed identity, so the API can call the agent
//
// Deploy (resource group scope) — reuse the same resource group as the
// Work Order & Warranty System so the whole demo tears down in one go:
//   az group create -n rg-contoso-workorders -l eastus
//   az deployment group create \
//     -g rg-contoso-workorders \
//     -f foundry-agent/infra/main.bicep \
//     -p foundry-agent/infra/main.parameters.json \
//     -p webAppPrincipalId=$(az webapp identity show -g rg-contoso-workorders -n <webAppName> --query principalId -o tsv)
//
// Then create the agent itself:
//   cd foundry-agent && npm install && npm run create-agent
// See README.md for full steps.
// =============================================================================

@description('Base name used to derive resource names. Lowercase letters and numbers.')
@minLength(3)
@maxLength(20)
param appName string = 'contosowo'

@description('Azure region for the Foundry resource. Must support the requested model.')
@allowed([
  'eastus'
  'eastus2'
  'westus'
  'westus3'
  'swedencentral'
  'francecentral'
  'uksouth'
])
param location string = 'eastus'

@description('Name of the Azure AI Foundry project that hosts the agent.')
param projectName string = 'proj-predictive-maintenance'

@description('Display name shown for the project in the Foundry portal.')
param projectDisplayName string = 'Contoso Predictive Maintenance'

@description('Name of the model deployment the agent runs on.')
param modelDeploymentName string = 'gpt-4.1-mini'

@description('Model to deploy for the agent.')
param modelName string = 'gpt-4.1-mini'

@description('Model version to deploy. Azure rejects versions in a deprecating state - see README.md for how to list current versions.')
param modelVersion string = '2025-04-14'

@description('Deployment SKU. GlobalStandard is pay-as-you-go with no capacity reservation.')
@allowed([
  'GlobalStandard'
  'Standard'
  'DataZoneStandard'
])
param modelSkuName string = 'GlobalStandard'

@description('Tokens-per-minute capacity, in thousands. 20 is ample for the demo.')
@minValue(1)
@maxValue(500)
param modelCapacity int = 20

@description('Optional principal ID of the Work Order & Warranty System App Service managed identity. When supplied, it is granted the Foundry User role so POST /api/foundry/predict can call the agent without keys.')
param webAppPrincipalId string = ''

var suffix = uniqueString(resourceGroup().id)
var foundryName = 'aif-${appName}-${suffix}'

// Built-in role: Foundry User (formerly Azure AI User) - data-plane access to agents.
var azureAiUserRoleId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'

// -----------------------------------------------------------------------------
// Azure AI Foundry resource
// -----------------------------------------------------------------------------
resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: foundryName
  location: location
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // Required for Foundry projects / Agent Service.
    allowProjectManagement: true
    customSubDomainName: foundryName
    publicNetworkAccess: 'Enabled'
    // Entra ID only - no API keys to leak in a demo repo.
    disableLocalAuth: true
  }
}

// -----------------------------------------------------------------------------
// Model deployment used by the agent
// -----------------------------------------------------------------------------
resource modelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: modelDeploymentName
  sku: {
    name: modelSkuName
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

// -----------------------------------------------------------------------------
// Foundry project (hosts the Predictive Maintenance Insights agent)
// -----------------------------------------------------------------------------
resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: projectName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: projectDisplayName
    description: 'Hosts the Predictive Maintenance Insights agent for the AI Solution Accelerator demo.'
  }
  // Deploy the model first so the agent has a model to bind to.
  dependsOn: [
    modelDeployment
  ]
}

// -----------------------------------------------------------------------------
// Let the Work Order & Warranty System call the agent with its managed identity
// -----------------------------------------------------------------------------
resource webAppAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(webAppPrincipalId)) {
  name: guid(foundry.id, webAppPrincipalId, azureAiUserRoleId)
  scope: foundry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAiUserRoleId)
    principalId: webAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------
output foundryResourceName string = foundry.name
output projectName string = project.name
output modelDeploymentName string = modelDeployment.name

@description('Set this as FOUNDRY_PROJECT_ENDPOINT on the Work Order & Warranty System App Service.')
output projectEndpoint string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${projectName}'

output roleAssignmentCreated bool = !empty(webAppPrincipalId)
