'use strict';

/**
 * Creates (or versions) the "predictive-maintenance-insights" agent in the
 * Azure AI Foundry project provisioned by infra/main.bicep.
 *
 * The agent definition lives in agent/agent-definition.json and its system
 * prompt in agent/instructions.md, so the behaviour is source-controlled and
 * reviewable rather than clicked together in the portal. Re-running this adds a
 * new version of the same agent rather than creating a duplicate.
 *
 * Usage (from the foundry-agent folder):
 *   az login
 *   $env:FOUNDRY_PROJECT_ENDPOINT = "https://aif-xxxx.services.ai.azure.com/api/projects/proj-predictive-maintenance"
 *   npm install
 *   npm run create-agent
 */

const fs = require('fs');
const path = require('path');
const { upsertAgent } = require('./foundry-client');

const AGENT_DIR = path.join(__dirname, '..', 'agent');

const projectEndpoint =
  process.env.FOUNDRY_PROJECT_ENDPOINT || process.env.PROJECT_ENDPOINT || '';
const modelDeployment =
  process.env.FOUNDRY_MODEL_DEPLOYMENT || process.env.MODEL_DEPLOYMENT_NAME || 'gpt-4.1-mini';

if (!projectEndpoint) {
  console.error(
    'FOUNDRY_PROJECT_ENDPOINT is not set. Use the projectEndpoint output from foundry-agent/infra/main.bicep.'
  );
  process.exit(1);
}

async function main() {
  const config = JSON.parse(
    fs.readFileSync(path.join(AGENT_DIR, 'agent-definition.json'), 'utf8')
  );
  const instructions = fs.readFileSync(
    path.join(AGENT_DIR, config.instructionsFile || 'instructions.md'),
    'utf8'
  );

  const { agent, created } = await upsertAgent(projectEndpoint, {
    name: config.name,
    description: config.description,
    definition: {
      ...config.definition,
      model: modelDeployment,
      instructions,
    },
  });

  const version = agent.versions?.latest?.version || agent.version || '1';
  console.log(
    created ? `Created agent "${config.name}".` : `Added a new version of "${config.name}".`
  );
  console.log('');
  console.log(`  Agent name : ${config.name}`);
  console.log(`  Version    : ${version}`);
  console.log(`  Model      : ${modelDeployment}`);
  console.log(`  Endpoint   : ${projectEndpoint}`);
  console.log('');
  console.log('Wire it into the Work Order & Warranty System App Service:');
  console.log('');
  console.log('  az webapp config appsettings set `');
  console.log('    --resource-group rg-contoso-workorders `');
  console.log('    --name <webAppName> `');
  console.log(
    `    --settings FOUNDRY_PROJECT_ENDPOINT="${projectEndpoint}" FOUNDRY_AGENT_NAME="${config.name}"`
  );
}

main().catch((err) => {
  console.error('Failed to create the agent:', err.message);
  process.exit(1);
});
