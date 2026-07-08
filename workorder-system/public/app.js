'use strict';

const API = '';

document.getElementById('apiBase').textContent = window.location.origin + '/api';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

function warrantyBadge(w) {
  if (!w.underWarranty) return el('span', { class: 'badge expired' }, 'Expired');
  if (w.daysRemaining <= 90) {
    return el('span', { class: 'badge soon' }, `Expiring in ${w.daysRemaining}d`);
  }
  return el('span', { class: 'badge active' }, `Active (${w.daysRemaining}d)`);
}

function statusBadge(status) {
  const cls = 'status-' + status.toLowerCase().replace(/\s+/g, '-');
  return el('span', { class: `badge ${cls}` }, status);
}

async function loadStats() {
  const s = await getJSON(`${API}/api/stats`);
  const cards = [
    { value: s.totalEquipment, label: 'Total Equipment' },
    { value: s.underWarranty, label: 'Under Warranty' },
    { value: s.warrantyExpired, label: 'Warranty Expired' },
    { value: s.openWorkOrders, label: 'Open Work Orders' },
    { value: s.totalWorkOrders, label: 'Total Work Orders' },
  ];
  const container = document.getElementById('statCards');
  container.innerHTML = '';
  cards.forEach((c) => {
    container.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'value' }, String(c.value)),
        el('div', { class: 'label' }, c.label),
      ])
    );
  });
}

async function loadEquipment() {
  const equipment = await getJSON(`${API}/api/equipment`);
  const tbody = document.querySelector('#equipmentTable tbody');
  tbody.innerHTML = '';
  const select = document.getElementById('assetId');
  select.innerHTML = '';

  equipment.forEach((e) => {
    tbody.appendChild(
      el('tr', {}, [
        el('td', {}, el('code', {}, e.assetId)),
        el('td', {}, `${e.name}`),
        el('td', {}, e.category),
        el('td', {}, e.location),
        el('td', {}, e.warrantyExpiry),
        el('td', {}, warrantyBadge(e.warranty)),
      ])
    );
    select.appendChild(el('option', { value: e.assetId }, `${e.assetId} — ${e.name}`));
  });
}

async function loadWorkOrders() {
  const orders = await getJSON(`${API}/api/workorders`);
  const tbody = document.querySelector('#workOrderTable tbody');
  tbody.innerHTML = '';

  if (!orders.length) {
    tbody.appendChild(el('tr', {}, el('td', { colspan: '8' }, 'No work orders yet.')));
    return;
  }

  orders.forEach((w) => {
    const prioClass =
      w.priority === 'Critical' ? 'prio-critical' : w.priority === 'High' ? 'prio-high' : '';
    const advanceBtn = el('button', { class: 'btn-sm' }, nextStatusLabel(w.status));
    advanceBtn.addEventListener('click', () => advanceStatus(w));

    tbody.appendChild(
      el('tr', {}, [
        el('td', {}, el('code', {}, w.id)),
        el('td', {}, `${w.assetId}`),
        el('td', {}, w.title),
        el('td', { class: prioClass }, w.priority),
        el('td', {}, statusBadge(w.status)),
        el('td', {}, w.requestedBy || ''),
        el('td', {}, new Date(w.createdAt).toLocaleString()),
        el('td', {}, ['Completed', 'Cancelled'].includes(w.status) ? null : advanceBtn),
      ])
    );
  });
}

function nextStatusLabel(status) {
  if (status === 'Open') return 'Start';
  if (status === 'In Progress') return 'Complete';
  if (status === 'On Hold') return 'Resume';
  return '—';
}

async function advanceStatus(wo) {
  const next =
    wo.status === 'Open' ? 'In Progress' : wo.status === 'On Hold' ? 'In Progress' : 'Completed';
  await fetch(`${API}/api/workorders/${wo.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: next }),
  });
  await refresh();
}

async function refresh() {
  await Promise.all([loadStats(), loadEquipment(), loadWorkOrders()]);
}

document.getElementById('workOrderForm').addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const msg = document.getElementById('formMsg');
  msg.textContent = '';
  msg.className = 'form-msg';

  const payload = {
    assetId: document.getElementById('assetId').value,
    title: document.getElementById('title').value,
    priority: document.getElementById('priority').value,
    requestedBy: document.getElementById('requestedBy').value,
    description: document.getElementById('description').value,
  };

  try {
    const res = await fetch(`${API}/api/workorders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = (data.errors || [data.error]).join(' ');
      msg.classList.add('err');
      return;
    }
    msg.textContent = `Created ${data.id}`;
    msg.classList.add('ok');
    document.getElementById('workOrderForm').reset();
    await refresh();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('err');
  }
});

document.getElementById('refreshBtn').addEventListener('click', refresh);

refresh().catch((err) => console.error(err));
setInterval(() => refresh().catch(() => {}), 15000);
