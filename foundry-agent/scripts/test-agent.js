'use strict';

/**
 * Smoke-tests the "predictive-maintenance-insights" agent directly against the
 * Azure AI Foundry project, bypassing the Work Order & Warranty System. Use it
 * to confirm the Foundry half works before wiring up the App Service.
 *
 * Usage (from the foundry-agent folder):
 *   $env:FOUNDRY_PROJECT_ENDPOINT = "https://aif-xxxx.services.ai.azure.com/api/projects/proj-predictive-maintenance"
 *   npm run test-agent
 */

const fs = require('fs');
const path = require('path');
const { runAgent } = require('./foundry-client');

const projectEndpoint =
  process.env.FOUNDRY_PROJECT_ENDPOINT || process.env.PROJECT_ENDPOINT || '';
const agentName = process.env.FOUNDRY_AGENT_NAME || 'predictive-maintenance-insights';

if (!projectEndpoint) {
  console.error('Set FOUNDRY_PROJECT_ENDPOINT before running this script.');
  process.exit(1);
}

async function main() {
  const payload = fs.readFileSync(
    path.join(__dirname, '..', 'agent', 'sample-request.json'),
    'utf8'
  );

  console.log(`Running agent "${agentName}"...`);
  const output = await runAgent(projectEndpoint, agentName, payload);
  console.log('');
  console.log(output);
}

main().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
