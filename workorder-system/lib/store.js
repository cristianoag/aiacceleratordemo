'use strict';

/**
 * Simple JSON-file backed data store for the Contoso work order system.
 *
 * - Equipment is seeded (read-only) from data/equipment.json.
 * - Work orders are persisted to a writable JSON file (WORKORDER_DATA_FILE
 *   or data/workorders.json by default).
 *
 * Warranty status is computed from each equipment's warrantyExpiry date, so
 * this system is the single source of truth for warranty checks.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EQUIPMENT_FILE = path.join(DATA_DIR, 'equipment.json');
const WORKORDER_FILE =
  process.env.WORKORDER_DATA_FILE || path.join(DATA_DIR, 'workorders.json');

const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const VALID_STATUSES = ['Open', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];

let equipment = [];
let workOrders = [];

function loadEquipment() {
  const raw = fs.readFileSync(EQUIPMENT_FILE, 'utf8');
  equipment = JSON.parse(raw);
}

function loadWorkOrders() {
  try {
    if (fs.existsSync(WORKORDER_FILE)) {
      workOrders = JSON.parse(fs.readFileSync(WORKORDER_FILE, 'utf8'));
    } else {
      workOrders = [];
      persistWorkOrders();
    }
  } catch (err) {
    // If the file is corrupt, start fresh rather than crash the demo app.
    console.error('Failed to read work orders file, starting empty:', err.message);
    workOrders = [];
  }
}

function persistWorkOrders() {
  fs.mkdirSync(path.dirname(WORKORDER_FILE), { recursive: true });
  fs.writeFileSync(WORKORDER_FILE, JSON.stringify(workOrders, null, 2), 'utf8');
}

function init() {
  loadEquipment();
  loadWorkOrders();
}

// ---------------------------------------------------------------------------
// Warranty
// ---------------------------------------------------------------------------
function computeWarranty(item, asOf = new Date()) {
  const expiry = new Date(item.warrantyExpiry + 'T00:00:00Z');
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.ceil((expiry.getTime() - asOf.getTime()) / msPerDay);
  const underWarranty = daysRemaining >= 0;
  return {
    assetId: item.assetId,
    name: item.name,
    model: item.model,
    warrantyProvider: item.warrantyProvider,
    installDate: item.installDate,
    warrantyExpiry: item.warrantyExpiry,
    underWarranty,
    status: underWarranty ? 'Active' : 'Expired',
    daysRemaining,
    supportContact: item.supportContact,
    checkedAt: asOf.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------
function listEquipment() {
  return equipment.map((item) => ({
    ...item,
    warranty: computeWarranty(item),
  }));
}

function findEquipment(assetId) {
  if (!assetId) return null;
  const id = String(assetId).trim().toUpperCase();
  return equipment.find((e) => e.assetId.toUpperCase() === id) || null;
}

function getEquipment(assetId) {
  const item = findEquipment(assetId);
  if (!item) return null;
  return { ...item, warranty: computeWarranty(item) };
}

function getWarranty(assetId) {
  const item = findEquipment(assetId);
  if (!item) return null;
  return computeWarranty(item);
}

// ---------------------------------------------------------------------------
// Work orders
// ---------------------------------------------------------------------------
function nextWorkOrderId() {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const maxSeq = workOrders
    .filter((w) => w.id.startsWith(prefix))
    .reduce((max, w) => {
      const seq = parseInt(w.id.slice(prefix.length), 10);
      return Number.isNaN(seq) ? max : Math.max(max, seq);
    }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

function listWorkOrders(filters = {}) {
  let result = [...workOrders];
  if (filters.assetId) {
    const id = String(filters.assetId).trim().toUpperCase();
    result = result.filter((w) => w.assetId.toUpperCase() === id);
  }
  if (filters.status) {
    const status = String(filters.status).trim().toLowerCase();
    result = result.filter((w) => w.status.toLowerCase() === status);
  }
  return result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getWorkOrder(id) {
  if (!id) return null;
  const wid = String(id).trim().toUpperCase();
  return workOrders.find((w) => w.id.toUpperCase() === wid) || null;
}

function createWorkOrder(payload = {}) {
  const errors = [];
  const assetId = payload.assetId ? String(payload.assetId).trim() : '';
  const title = payload.title ? String(payload.title).trim() : '';

  if (!assetId) errors.push('assetId is required.');
  const equipmentItem = findEquipment(assetId);
  if (assetId && !equipmentItem) {
    errors.push(`Unknown assetId '${assetId}'.`);
  }
  if (!title) errors.push('title is required.');

  let priority = payload.priority ? String(payload.priority).trim() : 'Medium';
  priority =
    VALID_PRIORITIES.find((p) => p.toLowerCase() === priority.toLowerCase()) ||
    null;
  if (!priority) {
    errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}.`);
  }

  if (errors.length) {
    return { errors };
  }

  const now = new Date().toISOString();
  const workOrder = {
    id: nextWorkOrderId(),
    assetId: equipmentItem.assetId,
    equipmentName: equipmentItem.name,
    equipmentModel: equipmentItem.model,
    location: equipmentItem.location,
    title,
    description: payload.description ? String(payload.description).trim() : '',
    priority,
    status: 'Open',
    requestedBy: payload.requestedBy ? String(payload.requestedBy).trim() : 'Copilot Agent',
    assignedTo: payload.assignedTo ? String(payload.assignedTo).trim() : null,
    underWarrantyAtCreation: computeWarranty(equipmentItem).underWarranty,
    createdAt: now,
    updatedAt: now,
    notes: [],
  };

  workOrders.push(workOrder);
  persistWorkOrders();
  return { workOrder };
}

function updateWorkOrder(id, changes = {}) {
  const workOrder = getWorkOrder(id);
  if (!workOrder) return { notFound: true };

  const errors = [];
  if (changes.status !== undefined) {
    const status = VALID_STATUSES.find(
      (s) => s.toLowerCase() === String(changes.status).trim().toLowerCase()
    );
    if (!status) {
      errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}.`);
    } else {
      workOrder.status = status;
    }
  }
  if (changes.priority !== undefined) {
    const priority = VALID_PRIORITIES.find(
      (p) => p.toLowerCase() === String(changes.priority).trim().toLowerCase()
    );
    if (!priority) {
      errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}.`);
    } else {
      workOrder.priority = priority;
    }
  }
  if (changes.assignedTo !== undefined) {
    workOrder.assignedTo = changes.assignedTo ? String(changes.assignedTo).trim() : null;
  }
  if (changes.description !== undefined) {
    workOrder.description = String(changes.description).trim();
  }
  if (changes.note) {
    workOrder.notes.push({
      text: String(changes.note).trim(),
      at: new Date().toISOString(),
    });
  }

  if (errors.length) {
    return { errors };
  }

  workOrder.updatedAt = new Date().toISOString();
  persistWorkOrders();
  return { workOrder };
}

function stats() {
  const eq = listEquipment();
  const underWarranty = eq.filter((e) => e.warranty.underWarranty).length;
  return {
    totalEquipment: eq.length,
    underWarranty,
    warrantyExpired: eq.length - underWarranty,
    totalWorkOrders: workOrders.length,
    openWorkOrders: workOrders.filter(
      (w) => !['Completed', 'Cancelled'].includes(w.status)
    ).length,
  };
}

module.exports = {
  init,
  VALID_PRIORITIES,
  VALID_STATUSES,
  listEquipment,
  getEquipment,
  getWarranty,
  listWorkOrders,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  stats,
};
