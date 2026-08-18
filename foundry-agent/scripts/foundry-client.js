'use strict';

/**
 * Minimal REST client for the Azure AI Foundry v2 agents API.
 *
 * The v2 API replaced the legacy Assistants surface (`/assistants`, threads and
 * runs) that the `@azure/ai-agents` SDK targets: agents are now versioned
 * "prompt agents" under `/agents`, and they are invoked through the OpenAI
 * Responses protocol at `/openai/v1/responses`. There is no JS SDK for this
 * yet, so we talk to it directly with fetch + an Entra token.
 */

const { DefaultAzureCredential } = require('@azure/identity');

const SCOPE = 'https://ai.azure.com/.default';
const API_VERSION = 'v1';

let credential = null;
let cachedToken = null;

async function getToken() {
  if (cachedToken && cachedToken.expiresOnTimestamp - Date.now() > 5 * 60 * 1000) {
    return cachedToken.token;
  }
  if (!credential) credential = new DefaultAzureCredential();
  cachedToken = await credential.getToken(SCOPE);
  if (!cachedToken) throw new Error('Could not acquire an Entra token for Azure AI Foundry.');
  return cachedToken.token;
}

function baseUrl(projectEndpoint) {
  return String(projectEndpoint).replace(/\/+$/, '');
}

async function request(projectEndpoint, path, { method = 'GET', body, signal } = {}) {
  const token = await getToken();
  const response = await fetch(`${baseUrl(projectEndpoint)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || text || response.statusText;
    const error = new Error(`Foundry API ${method} ${path} failed (${response.status}): ${message}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** Creates the agent, or adds a new version if an agent with that name exists. */
async function upsertAgent(projectEndpoint, { name, description, definition }) {
  try {
    const created = await request(projectEndpoint, `/agents?api-version=${API_VERSION}`, {
      method: 'POST',
      body: { name, description, definition },
    });
    return { agent: created, created: true };
  } catch (err) {
    if (err.status !== 409) throw err;
    const version = await request(
      projectEndpoint,
      `/agents/${encodeURIComponent(name)}/versions?api-version=${API_VERSION}`,
      { method: 'POST', body: { description, definition } }
    );
    return { agent: version, created: false };
  }
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }
  for (const item of response?.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'output_text' && part.text) return part.text;
    }
  }
  throw new Error('The Foundry agent returned no text output.');
}

// The json_object response format requires the word "JSON" in the input itself,
// not just in the agent instructions.
const JSON_PREFIX =
  'Assess the asset described below and respond with raw JSON only, following your output contract.\n\n';

/** Invokes an agent by name through the Responses protocol and returns its text. */
async function runAgent(projectEndpoint, agentName, input, { timeoutMs = 45000 } = {}) {
  const response = await request(projectEndpoint, '/openai/v1/responses', {
    method: 'POST',
    body: {
      agent_reference: { type: 'agent_reference', name: agentName },
      input: `${JSON_PREFIX}${input}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status && response.status !== 'completed') {
    const detail = response.error?.message || response.incomplete_details?.reason || '';
    throw new Error(`Foundry response ended with status '${response.status}'${detail ? `: ${detail}` : ''}`);
  }
  return extractOutputText(response);
}

module.exports = {
  API_VERSION,
  JSON_PREFIX,
  request,
  upsertAgent,
  runAgent,
};
