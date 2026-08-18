'use strict';

/**
 * Predictive Maintenance Insights - Azure AI Foundry integration.
 *
 * Backs `POST /api/foundry/predict`. Given an assetId it assembles the same
 * equipment, warranty, and work-order data the Copilot Studio agent already
 * uses, hands it to the "Predictive Maintenance Insights" agent running in
 * Azure AI Foundry Agent Service (see ../../foundry-agent), and returns a risk
 * score plus a recommended maintenance action.
 *
 * Configuration (App Service application settings):
 *   FOUNDRY_PROJECT_ENDPOINT  Foundry project endpoint, e.g.
 *                             https://aif-xxxx.services.ai.azure.com/api/projects/proj-predictive-maintenance
 *   FOUNDRY_AGENT_NAME        Agent name created by foundry-agent/scripts/create-agent.js
 *   FOUNDRY_TIMEOUT_MS        Max time to wait for a response (default 45000)
 *   FOUNDRY_FALLBACK          Set to 'off' to fail instead of falling back
 *
 * When Foundry is not configured (or a call fails and fallback is enabled) the
 * endpoint returns the deterministic heuristic score instead, so the demo works
 * offline and never dead-ends on stage.
 */

const store = require('./store');

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DEFAULT_HISTORY_LIMIT = 5;
const MAX_HISTORY_LIMIT = 20;

const PRIORITY_BY_LEVEL = {
  Low: 'Low',
  Moderate: 'Medium',
  High: 'High',
  Critical: 'Critical',
};
const DAYS_BY_LEVEL = { Low: 90, Moderate: 30, High: 14, Critical: 3 };
const RISK_LEVELS = Object.keys(PRIORITY_BY_LEVEL);
const IMPACTS = ['Low', 'Medium', 'High'];

function isConfigured() {
  return Boolean(process.env.FOUNDRY_PROJECT_ENDPOINT && process.env.FOUNDRY_AGENT_NAME);
}

function fallbackEnabled() {
  return String(process.env.FOUNDRY_FALLBACK || '').toLowerCase() !== 'off';
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------
function daysSince(isoDate, asOf) {
  if (!isoDate) return null;
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((asOf.getTime() - then.getTime()) / MS_PER_DAY);
}

function normalizeHistoryEntry(entry) {
  return {
    id: entry.id || null,
    title: entry.title || '',
    description: entry.description || '',
    priority: entry.priority || 'Medium',
    status: entry.status || 'Open',
    createdAt: entry.createdAt || null,
  };
}

/**
 * Merges the work-order history held by this system with any extra history the
 * caller supplied (Copilot Studio can pass observations that were never
 * ticketed). Caller entries with an unknown id are appended.
 */
function mergeHistory(systemHistory, callerHistory, limit) {
  const merged = systemHistory.map(normalizeHistoryEntry);
  const knownIds = new Set(merged.map((w) => (w.id || '').toUpperCase()).filter(Boolean));

  if (Array.isArray(callerHistory)) {
    for (const entry of callerHistory) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.id ? String(entry.id).toUpperCase() : '';
      if (id && knownIds.has(id)) continue;
      merged.push(normalizeHistoryEntry(entry));
    }
  }

  return merged
    .sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1))
    .slice(0, limit);
}

function computeSignals(equipmentItem, history, asOf) {
  const ageDays = daysSince(equipmentItem.installDate, asOf);
  const createdDays = history
    .map((w) => daysSince(w.createdAt, asOf))
    .filter((d) => d !== null)
    .sort((a, b) => a - b);

  let meanDaysBetweenWorkOrders = null;
  if (createdDays.length >= 2) {
    const span = createdDays[createdDays.length - 1] - createdDays[0];
    meanDaysBetweenWorkOrders = Math.round(span / (createdDays.length - 1));
  }

  return {
    ageYears: ageDays === null ? null : Math.round((ageDays / 365) * 10) / 10,
    totalWorkOrders: history.length,
    openWorkOrders: history.filter((w) => !['Completed', 'Cancelled'].includes(w.status)).length,
    highOrCriticalWorkOrders: history.filter((w) => ['High', 'Critical'].includes(w.priority))
      .length,
    workOrdersLast90Days: createdDays.filter((d) => d <= 90).length,
    workOrdersLast365Days: createdDays.filter((d) => d <= 365).length,
    daysSinceLastWorkOrder: createdDays.length ? createdDays[0] : null,
    meanDaysBetweenWorkOrders,
  };
}

// ---------------------------------------------------------------------------
// Deterministic baseline (also the offline fallback)
// ---------------------------------------------------------------------------
function levelForScore(score) {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Moderate';
  return 'Low';
}

function heuristicScore(signals, warranty) {
  const s = signals;
  let score = 0;

  if (s.ageYears !== null) score += Math.min(s.ageYears * 5, 25);
  if (warranty && !warranty.underWarranty) score += 15;
  else if (warranty && warranty.daysRemaining < 90) score += 7;

  score += Math.min(s.workOrdersLast365Days * 6, 24);
  score += Math.min(s.workOrdersLast90Days * 8, 16);
  score += Math.min(s.highOrCriticalWorkOrders * 7, 14);
  score += Math.min(s.openWorkOrders * 5, 10);
  if (s.meanDaysBetweenWorkOrders !== null && s.meanDaysBetweenWorkOrders < 60) score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function heuristicRiskFactors(signals, warranty, equipmentItem) {
  const factors = [];
  if (signals.workOrdersLast90Days > 0) {
    factors.push({
      factor: 'Recent failure activity',
      impact: signals.workOrdersLast90Days > 1 ? 'High' : 'Medium',
      detail: `${signals.workOrdersLast90Days} work order(s) raised in the last 90 days.`,
    });
  }
  if (signals.openWorkOrders > 0) {
    factors.push({
      factor: 'Unresolved backlog',
      impact: 'Medium',
      detail: `${signals.openWorkOrders} of ${signals.totalWorkOrders} work order(s) are still open.`,
    });
  }
  if (warranty && !warranty.underWarranty) {
    factors.push({
      factor: 'No warranty cover',
      impact: 'Medium',
      detail: `Warranty expired on ${warranty.warrantyExpiry}; repairs are billable.`,
    });
  }
  if (signals.ageYears !== null && signals.ageYears >= 3) {
    factors.push({
      factor: 'Equipment age',
      impact: signals.ageYears >= 5 ? 'High' : 'Medium',
      detail: `${equipmentItem.name} has been in service for ${signals.ageYears} years since ${equipmentItem.installDate}.`,
    });
  }
  if (!factors.length) {
    factors.push({
      factor: 'Stable service record',
      impact: 'Low',
      detail: 'No recent work orders and warranty cover is active.',
    });
  }
  return factors.slice(0, 4);
}

function heuristicPrediction(equipmentItem, warranty, signals) {
  const riskScore = heuristicScore(signals, warranty);
  const riskLevel = levelForScore(riskScore);
  const warrantyNote = warranty && warranty.underWarranty
    ? `Raise the job against the active warranty with ${warranty.warrantyProvider} (${warranty.supportContact}).`
    : 'Warranty has expired, so request a service quote from the vendor before ordering parts.';

  const actionByLevel = {
    Critical: `Take ${equipmentItem.name} (${equipmentItem.assetId}) out of production for inspection now.`,
    High: `Schedule preventive maintenance on ${equipmentItem.name} (${equipmentItem.assetId}) within the next two weeks.`,
    Moderate: `Bring the next planned service for ${equipmentItem.name} (${equipmentItem.assetId}) forward and monitor it this month.`,
    Low: `Keep ${equipmentItem.name} (${equipmentItem.assetId}) on its routine maintenance schedule.`,
  };

  const confidence =
    Math.round(
      Math.min(0.9, 0.5 + Math.min(signals.totalWorkOrders * 0.06, 0.3) + (warranty ? 0.1 : 0)) * 100
    ) / 100;

  return {
    riskScore,
    riskLevel,
    confidence,
    recommendedAction: `${actionByLevel[riskLevel]} ${warrantyNote}`,
    recommendedPriority: PRIORITY_BY_LEVEL[riskLevel],
    recommendedWithinDays: DAYS_BY_LEVEL[riskLevel],
    rationale: `Scored from ${signals.totalWorkOrders} work order(s) (${signals.workOrdersLast90Days} in the last 90 days, ${signals.highOrCriticalWorkOrders} at High or Critical priority), ${signals.ageYears ?? 'unknown'} years in service, and warranty status ${warranty ? warranty.status : 'unknown'}.`,
    riskFactors: heuristicRiskFactors(signals, warranty, equipmentItem),
    suggestedWorkOrderTitle: `${riskLevel} risk: inspect ${equipmentItem.name}`.slice(0, 60),
  };
}

// ---------------------------------------------------------------------------
// Azure AI Foundry Agent Service (v2 agents + Responses protocol)
// ---------------------------------------------------------------------------
// The v2 API replaced the legacy Assistants surface (threads and runs) that the
// @azure/ai-agents SDK targets: agents are versioned "prompt agents" invoked
// through /openai/v1/responses. There is no JS SDK for it yet, so this calls the
// REST endpoint directly with an Entra token.
const FOUNDRY_SCOPE = 'https://ai.azure.com/.default';

// The json_object response format requires the word "JSON" in the input itself,
// not just in the agent instructions.
const JSON_PREFIX =
  'Assess the asset described below and respond with raw JSON only, following your output contract.\n\n';

let credential = null;
let cachedToken = null;

async function getToken() {
  if (cachedToken && cachedToken.expiresOnTimestamp - Date.now() > 5 * 60 * 1000) {
    return cachedToken.token;
  }
  if (!credential) {
    let DefaultAzureCredential;
    try {
      ({ DefaultAzureCredential } = require('@azure/identity'));
    } catch {
      throw new Error(
        "The @azure/identity package is not installed. Run 'npm install' in workorder-system."
      );
    }
    credential = new DefaultAzureCredential();
  }
  cachedToken = await credential.getToken(FOUNDRY_SCOPE);
  if (!cachedToken) throw new Error('Could not acquire an Entra token for Azure AI Foundry.');
  return cachedToken.token;
}

/** Agents are told to return raw JSON, but tolerate code fences or stray prose. */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('The agent did not return a JSON object.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
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

async function callFoundryAgent(context) {
  const endpoint = String(process.env.FOUNDRY_PROJECT_ENDPOINT).replace(/\/+$/, '');
  const agentName = process.env.FOUNDRY_AGENT_NAME;
  const timeoutMs = Number(process.env.FOUNDRY_TIMEOUT_MS) || 45000;
  const token = await getToken();

  const response = await fetch(`${endpoint}/openai/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_reference: { type: 'agent_reference', name: agentName },
      input: `${JSON_PREFIX}${JSON.stringify(context, null, 2)}`,
    }),
    signal: AbortSignal.timeout(timeoutMs),
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
    throw new Error(`Foundry responses call failed (${response.status}): ${message}`);
  }
  if (payload.status && payload.status !== 'completed') {
    const detail = payload.error?.message || payload.incomplete_details?.reason || '';
    throw new Error(
      `Foundry response ended with status '${payload.status}'${detail ? `: ${detail}` : ''}`
    );
  }

  return extractJson(extractOutputText(payload));
}

// ---------------------------------------------------------------------------
// Validation / merge of the model output
// ---------------------------------------------------------------------------
function pickEnum(value, allowed, fallback) {
  if (typeof value !== 'string') return fallback;
  return allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase()) || fallback;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeRiskFactors(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;
  const cleaned = value
    .filter((f) => f && typeof f === 'object' && f.factor)
    .slice(0, 4)
    .map((f) => ({
      factor: String(f.factor).slice(0, 80),
      impact: pickEnum(f.impact, IMPACTS, 'Medium'),
      detail: f.detail ? String(f.detail).slice(0, 300) : '',
    }));
  return cleaned.length ? cleaned : fallback;
}

function mergePrediction(modelOutput, baseline) {
  const riskScore = Math.round(clampNumber(modelOutput.riskScore, 0, 100, baseline.riskScore));
  const riskLevel = pickEnum(modelOutput.riskLevel, RISK_LEVELS, levelForScore(riskScore));
  return {
    riskScore,
    riskLevel,
    confidence: clampNumber(modelOutput.confidence, 0, 1, baseline.confidence),
    recommendedAction: modelOutput.recommendedAction
      ? String(modelOutput.recommendedAction).slice(0, 600)
      : baseline.recommendedAction,
    recommendedPriority: pickEnum(
      modelOutput.recommendedPriority,
      store.VALID_PRIORITIES,
      PRIORITY_BY_LEVEL[riskLevel]
    ),
    recommendedWithinDays: Math.round(
      clampNumber(modelOutput.recommendedWithinDays, 1, 365, DAYS_BY_LEVEL[riskLevel])
    ),
    rationale: modelOutput.rationale
      ? String(modelOutput.rationale).slice(0, 1200)
      : baseline.rationale,
    riskFactors: sanitizeRiskFactors(modelOutput.riskFactors, baseline.riskFactors),
    suggestedWorkOrderTitle: (modelOutput.suggestedWorkOrderTitle
      ? String(modelOutput.suggestedWorkOrderTitle)
      : baseline.suggestedWorkOrderTitle
    ).slice(0, 60),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
async function predict(request = {}) {
  const asOf = new Date();
  const equipmentItem = store.getEquipment(request.assetId);
  if (!equipmentItem) return { notFound: true };

  const warranty = store.getWarranty(request.assetId);
  const limit = Math.min(
    MAX_HISTORY_LIMIT,
    Math.max(1, Number(request.historyLimit) || DEFAULT_HISTORY_LIMIT)
  );
  const history = mergeHistory(
    store.listWorkOrders({ assetId: equipmentItem.assetId }),
    request.workOrderHistory,
    limit
  );
  const signals = computeSignals(equipmentItem, history, asOf);
  const baseline = heuristicPrediction(equipmentItem, warranty, signals);

  const context = {
    asset: {
      assetId: equipmentItem.assetId,
      name: equipmentItem.name,
      model: equipmentItem.model,
      category: equipmentItem.category,
      location: equipmentItem.location,
      manufacturer: equipmentItem.manufacturer,
      installDate: equipmentItem.installDate,
    },
    warranty: {
      status: warranty.status,
      underWarranty: warranty.underWarranty,
      warrantyExpiry: warranty.warrantyExpiry,
      daysRemaining: warranty.daysRemaining,
      warrantyProvider: warranty.warrantyProvider,
      supportContact: warranty.supportContact,
    },
    signals,
    workOrderHistory: history,
    baseline: {
      riskScore: baseline.riskScore,
      riskLevel: baseline.riskLevel,
      method: 'local-heuristic',
    },
    asOf: asOf.toISOString(),
  };

  const envelope = {
    assetId: equipmentItem.assetId,
    equipmentName: equipmentItem.name,
    model: equipmentItem.model,
    location: equipmentItem.location,
    warrantyStatus: warranty.status,
    underWarranty: warranty.underWarranty,
    signals,
    workOrderHistory: history,
    generatedAt: asOf.toISOString(),
  };

  if (!isConfigured()) {
    if (!fallbackEnabled()) {
      throw new Error(
        'Azure AI Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_AGENT_NAME.'
      );
    }
    return {
      prediction: {
        ...envelope,
        ...baseline,
        source: 'local-heuristic',
        fallbackReason: 'Azure AI Foundry is not configured on this instance.',
      },
    };
  }

  try {
    const modelOutput = await callFoundryAgent(context);
    return {
      prediction: {
        ...envelope,
        ...mergePrediction(modelOutput, baseline),
        source: 'azure-ai-foundry',
        foundryAgentName: process.env.FOUNDRY_AGENT_NAME,
      },
    };
  } catch (err) {
    if (!fallbackEnabled()) throw err;
    console.error('Foundry prediction failed, using heuristic fallback:', err.message);
    return {
      prediction: {
        ...envelope,
        ...baseline,
        source: 'local-heuristic',
        fallbackReason: err.message,
      },
    };
  }
}

module.exports = {
  predict,
  isConfigured,
};
