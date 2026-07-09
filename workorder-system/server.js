'use strict';

/**
 * Contoso Electronics - Equipment Work Order & Warranty System
 * ------------------------------------------------------------
 * A lightweight Express app providing:
 *   - A JSON REST API used by the Copilot Studio agent / Azure Function to
 *     check warranty status and create/track work orders.
 *   - A simple web dashboard (in /public) to visualize equipment, warranty
 *     status, and work orders during the demo.
 *
 * Runs on Azure App Service (Linux, Node). Listens on process.env.PORT.
 */

const express = require('express');
const path = require('path');
const store = require('./lib/store');
const { handleMcpRequest } = require('./lib/mcp');

const app = express();
const PORT = process.env.PORT || 3000;

// Optional shared-secret protection for the API. If API_KEY is set, callers
// must send it via the 'x-api-key' header. Left unset for easy local demos.
const API_KEY = process.env.API_KEY || '';

store.init();

app.use(express.json());

// Basic CORS so the agent / connector can call the API from other origins.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// API key guard (only enforced when API_KEY is configured).
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!API_KEY) return next();
  if (req.header('x-api-key') === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header.' });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'contoso-workorder-system', time: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Equipment & warranty
// ---------------------------------------------------------------------------
app.get('/api/equipment', (_req, res) => {
  res.json(store.listEquipment());
});

app.get('/api/equipment/:assetId', (req, res) => {
  const item = store.getEquipment(req.params.assetId);
  if (!item) return res.status(404).json({ error: `Equipment '${req.params.assetId}' not found.` });
  res.json(item);
});

// Warranty check - primary source of truth for the agent.
app.get('/api/equipment/:assetId/warranty', (req, res) => {
  const warranty = store.getWarranty(req.params.assetId);
  if (!warranty) return res.status(404).json({ error: `Equipment '${req.params.assetId}' not found.` });
  res.json(warranty);
});

// Convenience alias: /api/warranty?assetId=CE-OSC-1200
app.get('/api/warranty', (req, res) => {
  if (!req.query.assetId) {
    return res.status(400).json({ error: 'Query parameter assetId is required.' });
  }
  const warranty = store.getWarranty(req.query.assetId);
  if (!warranty) return res.status(404).json({ error: `Equipment '${req.query.assetId}' not found.` });
  res.json(warranty);
});

// Alias matching the Copilot Studio connector operation 'checkWarranty'.
app.get('/api/checkWarranty', (req, res) => {
  if (!req.query.assetId) {
    return res.status(400).json({ error: 'The "assetId" query parameter is required.' });
  }
  const warranty = store.getWarranty(req.query.assetId);
  if (!warranty) return res.status(404).json({ error: `Equipment '${req.query.assetId}' not found.` });
  res.json(warranty);
});

// ---------------------------------------------------------------------------
// Work orders
// ---------------------------------------------------------------------------
app.get('/api/workorders', (req, res) => {
  res.json(store.listWorkOrders({ assetId: req.query.assetId, status: req.query.status }));
});

app.get('/api/workorders/:id', (req, res) => {
  const wo = store.getWorkOrder(req.params.id);
  if (!wo) return res.status(404).json({ error: `Work order '${req.params.id}' not found.` });
  res.json(wo);
});

app.post('/api/workorders', (req, res) => {
  const result = store.createWorkOrder(req.body || {});
  if (result.errors) return res.status(400).json({ errors: result.errors });
  res.status(201).json(result.workOrder);
});

// Alias matching the Copilot Studio connector operation 'createWorkOrder'.
app.post('/api/createWorkOrder', (req, res) => {
  const body = req.body || {};
  if (!body.assetId || !body.title) {
    return res.status(400).json({ error: 'The "assetId" and "title" fields are required.' });
  }
  const result = store.createWorkOrder(body);
  if (result.errors) return res.status(400).json({ errors: result.errors });
  res.status(201).json(result.workOrder);
});

app.patch('/api/workorders/:id', (req, res) => {
  const result = store.updateWorkOrder(req.params.id, req.body || {});
  if (result.notFound) return res.status(404).json({ error: `Work order '${req.params.id}' not found.` });
  if (result.errors) return res.status(400).json({ errors: result.errors });
  res.json(result.workOrder);
});

// ---------------------------------------------------------------------------
// Dashboard stats + static UI
// ---------------------------------------------------------------------------
app.get('/api/stats', (_req, res) => {
  res.json(store.stats());
});

// ---------------------------------------------------------------------------
// MCP endpoint (connector for the Copilot Cowork plugin)
// ---------------------------------------------------------------------------
app.post('/mcp', handleMcpRequest);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Contoso work order system listening on port ${PORT}`);
});

module.exports = app;
