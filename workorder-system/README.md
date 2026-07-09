# Contoso Electronics — Equipment Work Order & Warranty System

A lightweight web system that tracks **equipment work orders** and serves as the
**source of truth for warranty status** for the AI Solution Accelerator demo
(see [../docs/demo_proposal.md](../docs/demo_proposal.md)).

The Copilot Studio agent — through an Azure Function — calls this system's REST
API to **check warranty** and **create / track work orders**. A simple web
dashboard visualizes equipment, warranty status, and work orders during the demo.

- Runtime: Node.js + Express
- Hosting: Azure App Service (Linux)
- Persistence: JSON files (`data/equipment.json` seed + `data/workorders.json` at runtime)

---

## Project structure

```
workorder-system/
├── server.js                # Express app (API + static dashboard)
├── lib/store.js             # Data store + warranty logic
├── data/equipment.json      # Seeded equipment + warranty data (15 assets)
├── public/                  # Dashboard UI (index.html, styles.css, app.js)
├── infra/
│   ├── main.bicep           # Azure App Service + App Insights deployment
│   └── main.parameters.json # Deployment parameters
├── package.json
└── README.md
```

---

## Run locally

```powershell
cd workorder-system
npm install
npm start
# open http://localhost:3000
```

---

## REST API

Base URL: `<app-url>/api`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health probe (used by App Service health check). |
| GET | `/equipment` | List all equipment with computed warranty status. |
| GET | `/equipment/{assetId}` | Get one equipment record. |
| GET | `/equipment/{assetId}/warranty` | **Warranty check** for an asset. |
| GET | `/warranty?assetId=CE-OSC-1200` | Warranty check (query-string alias). |
| GET | `/workorders` | List work orders. Filters: `?assetId=`, `?status=`. |
| GET | `/workorders/{id}` | Get one work order. |
| POST | `/workorders` | Create a work order. |
| PATCH | `/workorders/{id}` | Update status / priority / assignee / add note. |
| GET | `/stats` | Dashboard summary counts. |
| POST | `/mcp` | MCP endpoint (Streamable HTTP, JSON-RPC 2.0) used by the Copilot Cowork plugin. |

### MCP connector

`POST /mcp` exposes a Model Context Protocol server (stateless Streamable HTTP)
consumed by the [Copilot Cowork plugin](../cowork-plugin). It provides these
tools: `list_equipment`, `get_equipment`, `check_warranty`, `list_work_orders`,
and `get_summary`. Implementation: [lib/mcp.js](./lib/mcp.js).

### Warranty response example

`GET /api/equipment/CE-OSC-1200/warranty`

```json
{
  "assetId": "CE-OSC-1200",
  "name": "Digital Storage Oscilloscope",
  "model": "Contoso WaveView DSO-4000X",
  "warrantyProvider": "Contoso Instruments Division",
  "installDate": "2023-03-14",
  "warrantyExpiry": "2027-03-14",
  "underWarranty": true,
  "status": "Active",
  "daysRemaining": 249,
  "supportContact": "test.equipment.support@contoso.com",
  "checkedAt": "2026-07-08T00:00:00.000Z"
}
```

### Create work order example

`POST /api/workorders`

```json
{
  "assetId": "CE-LAS-3300",
  "title": "Laser tube power output dropping",
  "description": "Incomplete cuts observed; suspect laser tube aging.",
  "priority": "High",
  "requestedBy": "Maintenance Manager"
}
```

Response `201 Created`:

```json
{
  "id": "WO-2026-0001",
  "assetId": "CE-LAS-3300",
  "equipmentName": "CO2 Laser Cutter",
  "title": "Laser tube power output dropping",
  "priority": "High",
  "status": "Open",
  "requestedBy": "Maintenance Manager",
  "underWarrantyAtCreation": false,
  "createdAt": "2026-07-08T12:00:00.000Z",
  "updatedAt": "2026-07-08T12:00:00.000Z",
  "notes": []
}
```

> Valid priorities: `Low`, `Medium`, `High`, `Critical`.
> Valid statuses: `Open`, `In Progress`, `On Hold`, `Completed`, `Cancelled`.

### Optional API key

Set the `API_KEY` app setting (or the `apiKey` Bicep parameter) to require an
`x-api-key` header on all `/api` routes except `/api/health`. Leave it empty for
open demo access.

---

## Deploy to Azure

### 1. Provision infrastructure with Bicep

```powershell
# Sign in and select the subscription
az login
az account set --subscription "<your-subscription-id>"

# Create a resource group
az group create -n rg-contoso-workorders -l eastus

# Deploy App Service + Application Insights
az deployment group create `
  -g rg-contoso-workorders `
  -f infra/main.bicep `
  -p infra/main.parameters.json
```

The deployment outputs `webAppUrl`, `apiBaseUrl`, and a `warrantyCheckExample`
URL. Note the `webAppName` for the next step.

### 2. Publish the application code

From the `workorder-system` folder:

```powershell
az webapp up `
  --name <webAppName-from-output> `
  --resource-group rg-contoso-workorders `
  --runtime "NODE:22-lts"
```

Or zip-deploy:

```powershell
Compress-Archive -Path * -DestinationPath app.zip -Force
az webapp deploy `
  --resource-group rg-contoso-workorders `
  --name <webAppName-from-output> `
  --src-path app.zip --type zip
```

`SCM_DO_BUILD_DURING_DEPLOYMENT=true` (set by Bicep) runs `npm install` on the
server during deployment.

### 3. Verify

- Open `webAppUrl` for the dashboard.
- Call the warranty example URL, e.g. `.../api/equipment/CE-OSC-1200/warranty`.

---

## Connecting to the agent

The Azure Function (built in the demo's "extend with code" step) should call:

- `GET  {apiBaseUrl}/equipment/{assetId}/warranty` — to check warranty.
- `POST {apiBaseUrl}/workorders` — to create a work order.
- `GET  {apiBaseUrl}/workorders?assetId={assetId}` — to look up existing work orders.

Add the Function as a tool/action in Copilot Studio (see
[../docs/demo_guide.md](../docs/demo_guide.md)).

---

## Notes

- Work order data persists to `/home/data/workorders.json` on App Service
  (the `/home` mount is persistent). Locally it uses `data/workorders.json`.
- Warranty status is computed live from `warrantyExpiry`, so results reflect the
  current date. Some seeded assets are intentionally **expired** to make the demo
  realistic.
