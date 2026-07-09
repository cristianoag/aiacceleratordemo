# Demo Guide (Run of Show)

## AI Solution Accelerator — 10 Minute Demo

This guide is the presenter script for the demo described in [demo_proposal.md](./demo_proposal.md). It assumes the environment is already configured per [setup_guide.md](./setup_guide.md): equipment documents split across **SharePoint** (Word) and **Azure AI Search** (PDF) and connected to a **Copilot Studio** agent, and the **Work Order & Warranty System** ([../workorder-system](../workorder-system)) already deployed to Azure App Service.

---

## Pre-demo checklist

- [ ] Copilot Studio agent (**Contoso Maintenance Assistant**) is published and responding.
- [ ] SharePoint knowledge source returns results (Word documents indexed).
- [ ] Azure AI Search index (`equipment-index`) indexer status is **Success** (PDF documents indexed).
- [ ] **Work Order & Warranty System is deployed** and the dashboard (`webAppUrl`) loads; `GET {apiBaseUrl}/health` returns `ok`.
- [ ] Web search is disabled on the agent so answers come from the documents.
- [ ] VS Code open with the repo and GitHub Copilot enabled (for the "extend with code" step).
- [ ] Azure subscription signed in for redeploying the Work Order & Warranty System.
- [ ] Work order dashboard open in a browser tab to show live updates.
- [ ] **Copilot Cowork plugin (Contoso Equipment Insights) installed and enabled** (for the deck-generation finale). See [setup_guide.md](./setup_guide.md) Part E.
- [ ] Test pane pre-loaded with one warm-up question.

---

## Run of show

### 1. Business challenge (1 min)
Set the scene: a maintenance manager at Contoso Electronics needs an assistant that can both **answer equipment questions** and **take action** (warranty checks, work orders).

### 2. Build the agent — knowledge Q&A (2 min)
- Open the agent in Copilot Studio; show the two connected knowledge sources.
- Ask a question answered by **SharePoint** (Word docs) and one answered by **Azure AI Search** (PDF docs) to prove both are working.

### 3. Extend the agent with code (3 min)
- Switch to VS Code (this repo is open); use GitHub Copilot to add **two HTTP endpoints** to the already-deployed Work Order & Warranty System: `checkWarranty` (→ `GET /api/equipment/{assetId}/warranty`) and `createWorkOrder` (→ `POST /api/workorders`).
- Redeploy the app to Azure App Service.
- **Use the exact prompts and commands in [Building, deploying & connecting the Azure Functions](#building-deploying--connecting-the-azure-functions) below.**

### 4. Connect the new capability (2 min)
- Add the two functions as **tools/actions** in Copilot Studio (see the same section below).
- Show the agent picking them up immediately.

### 5. End-to-end experience (2 min)
- Ask a question that needs **both** knowledge and the new action (e.g., look up an equipment issue and create a work order).
- The agent reasons over the documents, calls the function (which writes to the deployed system), and returns an actionable answer.
- Switch to the **work order dashboard** to show the new work order appear live.

### 6. (Optional finale) Generate a deck with Copilot Cowork (1 min)
- Switch to **Copilot Cowork** and prompt it to build an equipment status PowerPoint.
- The **Contoso Equipment Insights** plugin pulls live data from the same system and produces a deck — see [Generating a PowerPoint with Copilot Cowork](#generating-a-powerpoint-with-copilot-cowork).

---

## Building, deploying & connecting the Azure Functions

This is the detailed script for demo steps 3 and 4. It creates **two HTTP-triggered Azure Functions** that act as the bridge between the Copilot Studio agent and the deployed Work Order & Warranty System:

| Function | Method | Calls the system | Purpose |
|----------|--------|------------------|---------|
| `checkWarranty` | GET | `GET {WORKORDER_API_BASE}/equipment/{assetId}/warranty` | Check an asset's warranty status. |
| `createWorkOrder` | POST | `POST {WORKORDER_API_BASE}/workorders` | Create a work order for an asset. |

> **Note on hosting.** This subscription's governance policy blocks public network access and shared-key auth on new storage accounts, so a Consumption-plan Azure Function App can't be provisioned. Instead, the two operations are exposed as routes (`/api/checkWarranty`, `/api/createWorkOrder`) on the **already-deployed Work Order & Warranty System** App Service. The code-first "extend the agent" story is unchanged — you still write the handlers with Copilot and redeploy — there is just no separate Function App to manage.

**Prerequisites for this step**
- Azure CLI (`az`) installed and signed in.
- The **`webAppName`** / **`apiBaseUrl`** from Part C of [setup_guide.md](./setup_guide.md) (e.g. `https://app-contosowo-xxxx.azurewebsites.net/api`).

### Step A — Generate the endpoints with GitHub Copilot

With this repo open, open Copilot Chat (agent mode) and use these prompts one at a time.

**Prompt 1 — add the warranty endpoint**

> In `workorder-system/server.js`, add an HTTP-triggered route `GET /api/checkWarranty` that reads an `assetId` query parameter and returns the warranty status from the store (reuse `store.getWarranty`). If `assetId` is missing, return HTTP 400; if the asset is not found, return HTTP 404.

**Prompt 2 — add the create-work-order endpoint**

> In the same `server.js`, add a route `POST /api/createWorkOrder` that accepts a JSON body containing `assetId`, `title`, `priority`, `description`, and `requestedBy`, and creates a work order via `store.createWorkOrder`. Validate that `assetId` and `title` are present, returning HTTP 400 otherwise, and return the created work order with HTTP 201.

**Prompt 3 — an OpenAPI definition**

> Generate an **OpenAPI 2.0 (Swagger)** file named `workorder-system/openapi.json` describing both endpoints (`GET /api/checkWarranty` and `POST /api/createWorkOrder`), including parameters and example responses, so it can be imported as a custom connector in Copilot Studio.

> Tip: Verify locally before deploying — run `npm start` in the `workorder-system` folder and call `http://localhost:3000/api/checkWarranty?assetId=CE-OSC-1200`.

### Step B — Redeploy the Work Order & Warranty System

The `checkWarranty` and `createWorkOrder` operations are routes on the existing App Service, so there is **no Function App to provision** — just redeploy the app with the new code.

```powershell
# From the workorder-system folder (reuses the App Service from Part C)
cd workorder-system
az webapp up `
  --name <webAppName-from-Part-C> `
  --resource-group rg-contoso-workorders `
  --runtime "NODE:22-lts"
```

Smoke-test the two endpoints (replace the host with your `webAppUrl`):

```powershell
# Warranty check
curl "https://<webAppName>.azurewebsites.net/api/checkWarranty?assetId=CE-OSC-1200"

# Create a work order
curl -X POST "https://<webAppName>.azurewebsites.net/api/createWorkOrder" `
  -H "Content-Type: application/json" `
  -d '{"assetId":"CE-LAS-3300","title":"Laser cutter needs service","priority":"High"}'
```

### Step C — Add the functions as tools in Copilot Studio

**Recommended: import the OpenAPI file as a custom connector**

1. In [Copilot Studio](https://copilotstudio.microsoft.com), open your **Contoso Maintenance Assistant** agent.
2. Go to **Tools** (or **Actions**) → **Add a tool** → **New tool** → **Custom connector**. This opens Power Apps custom connectors.
3. Choose **New custom connector** → **Import an OpenAPI file** and upload `workorder-system/openapi.json`.
4. On **General**, set **Host** to `<webAppName>.azurewebsites.net` and **Base URL** to `/api`.
5. On **Security**, choose **No authentication** (the App Service API is open by default; if you set `API_KEY` on the app, choose **API Key**, parameter name `x-api-key`, location **Header** instead).
6. On **Definition**, confirm the two operations (`checkWarranty`, `createWorkOrder`) and their parameters; give each a clear **Summary/Description**.
7. **Create connector**, then **Test** it (no key needed unless `API_KEY` is set on the app).
8. Back in Copilot Studio, on the agent select **Add a tool**, pick your custom connector, and add both operations.

**Alternative: add each function as a REST API / HTTP action**

1. On the agent, **Add a tool** → **REST API** (or **Add an action** → **Create new**).
2. Provide the method and URL, e.g. `GET https://<webAppName>.azurewebsites.net/api/checkWarranty`.
3. If you set `API_KEY` on the app, add it as an `x-api-key` header; otherwise no auth is needed.
4. Define inputs (`assetId` for warranty; `assetId`, `title`, `priority`, `description`, `requestedBy` for work orders) and the JSON output.
5. Repeat for `createWorkOrder` (POST with a JSON body).

**For either approach — make the agent invoke the tools reliably**

- Give each tool a clear **description**, e.g.:
  - `checkWarranty`: "Checks the warranty status of a piece of equipment by its asset ID (e.g., CE-OSC-1200). Returns whether it is under warranty and days remaining."
  - `createWorkOrder`: "Creates a maintenance work order for a piece of equipment. Requires the asset ID and a short title; accepts priority and description."
- Describe each **input parameter** so the orchestrator maps user intent to arguments.
- **Save** and **Publish** the agent.

### Step D — Verify end to end

In the **Test** pane, run the Section D questions below (e.g., "Is CE-OSC-1200 under warranty?" and "Create a work order for the laser cutter"). Confirm the agent calls the functions and that new work orders appear on the dashboard.

---

## Generating a PowerPoint with Copilot Cowork

This is the optional finale (run-of-show step 6). It shows the **same** Work Order & Warranty System data being turned into a polished artifact by **Copilot Cowork** using the **Contoso Equipment Insights** plugin ([../cowork-plugin](../cowork-plugin)).

**Prerequisite:** the plugin is installed and enabled per [setup_guide.md](./setup_guide.md) Part E, and its connector points at your deployed system's `/mcp` endpoint.

### Steps

1. Open **Copilot Cowork**.
2. Go to **Sources & Skills → Plugins** and confirm **Contoso Equipment Insights** is enabled.
3. Enter one of the prompts below. Cowork triggers the `generate-equipment-deck` skill, calls the connector tools (`get_summary`, `list_equipment`, `list_work_orders`, ...) to pull **live** data, and builds the deck.
4. Show the generated PowerPoint \u2014 point out that the asset IDs, warranty statuses, and work orders match the dashboard and the agent's answers (single source of truth).

### Prompts to use

| Prompt | Result |
|--------|--------|
| "Create a PowerPoint deck summarizing our equipment warranty status and open work orders." | Full-fleet status deck (title, executive summary, inventory, warranty, attention-needed, work orders, recommendations). |
| "Generate an equipment status presentation and highlight anything out of warranty." | Deck emphasizing expired/expiring assets (e.g., CE-LAS-3300, CE-WAV-2600, CE-SOL-0450). |
| "Build a slide deck of all open and critical work orders by equipment." | Work-order-focused deck grouped by priority. |
| "Make a warranty summary deck for our test & measurement equipment." | Category-scoped deck (oscilloscope, function generator, multimeter, power supply). |

### Presenter tips

- Keep the **work order dashboard** visible alongside the generated deck so the audience sees the data match.
- If you created a new work order during step 5, ask Cowork to regenerate the deck to show it now includes that work order \u2014 reinforcing "one system, many surfaces".
- If the deck lacks real data, verify the plugin connector `mcpServerUrl` and that the system's `/mcp` endpoint is reachable.

---

## Sample questions

Ask these in the Test pane or published channel. Each maps to a document so you get grounded, high-quality answers. The **Source** column shows which knowledge source answers it.

### A. Answered by SharePoint (Word documents)

| Question | Expected answer highlights | Source |
|----------|----------------------------|--------|
| What is the temperature range of the soldering station? | 100 °C – 450 °C, ±2 °C stability (CE-SOL-0450) | SharePoint |
| The soldering station shows error E-04. What does it mean? | Heating element open circuit — replace the cartridge | SharePoint |
| How many heating zones does the reflow oven have? | 8 top + 8 bottom zones (CE-RFO-2100) | SharePoint |
| What causes cold solder joints on the reflow oven? | Verify profile peak temperature and time-above-liquidus | SharePoint |
| What temperature and humidity range does the environmental test chamber support? | −70 °C to +180 °C; 10%–98% RH (CE-ETC-3100) | SharePoint |
| How do I fix a humidity error on the environmental chamber? | Refill water reservoir, clean wick, verify sensor | SharePoint |
| What coating types does the conformal coating machine support? | Acrylic, silicone, urethane (CE-CCM-2800) | SharePoint |
| What is the alignment accuracy of the solder paste stencil printer? | ±12.5 µm @ 6σ (CE-SPP-2000) | SharePoint |
| What are the outputs of the programmable DC power supply? | Triple output: 2× 0–30 V/5 A and 1× 0–6 V/3 A (CE-PSU-1400) | SharePoint |
| How do I reduce false calls on the AOI system? | Retune thresholds, clean optics, verify lighting calibration | SharePoint |

### B. Answered by Azure AI Search (PDF documents)

| Question | Expected answer highlights | Source |
|----------|----------------------------|--------|
| What is the bandwidth of the digital oscilloscope? | 1 GHz, 4 channels, 5 GSa/s sample rate (CE-OSC-1200) | Azure AI Search |
| The oscilloscope self-calibration fails. What should I do? | 20-minute warm-up, disconnect all inputs, retry calibration | Azure AI Search |
| What materials must never be cut on the laser cutter? | Never cut PVC or chlorinated plastics; only approved materials | Azure AI Search |
| What is the laser cutter's work area and power? | 1300 × 900 mm, 150 W sealed CO2 (CE-LAS-3300) | Azure AI Search |
| What is the placement accuracy of the pick and place machine? | ±25 µm @ 3σ; up to 45,000 CPH (CE-PNP-2200) | Azure AI Search |
| Why is the wave soldering machine producing excessive dross? | Reduce wave turbulence; verify nitrogen if equipped | Azure AI Search |
| What modulation types does the function generator support? | AM, FM, PM, FSK, PWM, sweep, burst (CE-FGN-1300) | Azure AI Search |
| The bench multimeter shows no current reading. What's wrong? | Check the current-input fuse and that the lead is in the correct jack | Azure AI Search |
| What safety rules apply to the X-ray inspection system? | Ionizing radiation — never bypass interlocks; trained operators only; wear dosimeter | Azure AI Search |
| How do I clear an ESD wrist strap monitor alarm? | Check strap fit and cord; replace worn strap or cord (CE-ESD-0100) | Azure AI Search |

### C. Cross-source / reasoning questions (hit both sources)

| Question | Why it's a good demo question |
|----------|-------------------------------|
| List the safety precautions for all our soldering-related equipment. | Combines soldering station (SharePoint) + wave soldering (Azure AI Search). |
| Which pieces of test & measurement equipment do we have and what are their key specs? | Pulls oscilloscope, function generator, multimeter (Azure AI Search) + power supply (SharePoint). |
| Compare the reflow oven and the wave soldering machine — when do we use each? | Reflow (SharePoint) vs wave (Azure AI Search). |
| What maintenance is due monthly across our SMT line equipment? | Aggregates stencil printer, AOI (SharePoint) + pick-and-place (Azure AI Search). |

### D. Action questions (backed by the deployed Work Order & Warranty System)

Use these after the Azure Function tool is connected. The agent's Function calls the deployed system, so warranty answers and work orders are **real** and visible on the dashboard.

> Given the current date, some assets are intentionally **out of warranty** — great for showing the "expired → create work order" flow: CO2 Laser Cutter (CE-LAS-3300), Wave Soldering Machine (CE-WAV-2600), and Soldering Station (CE-SOL-0450). Assets like the Oscilloscope (CE-OSC-1200) and X-Ray System (CE-XRI-3400) are still **under warranty**.

| Question | Capability demonstrated |
|----------|-------------------------|
| Is the digital oscilloscope (CE-OSC-1200) still under warranty? | Warranty check — returns **Active** with days remaining. |
| Is the CO2 laser cutter (CE-LAS-3300) under warranty? | Warranty check — returns **Expired**. |
| The laser cutter (CE-LAS-3300) needs service — create a work order. | Work order creation; appears on the dashboard. |
| The soldering station keeps throwing error E-04. Look up the fix and open a maintenance work order for it. | End-to-end: knowledge retrieval + work order creation. |
| Check the warranty on the wave soldering machine (CE-WAV-2600) and, if expired, create a work order to renew the service contract. | Reasoning + conditional action against the live system. |
| Show me the open work orders for the laser cutter. | Work order lookup (`GET /workorders?assetId=CE-LAS-3300`). |

---

## Presenter tips

- Start with one **SharePoint** and one **Azure AI Search** question back-to-back to prove both sources work.
- Keep questions specific (include the equipment name or asset ID) for the cleanest, grounded answers.
- If an answer looks generic, confirm web search is disabled and the knowledge sources are healthy.
- Keep the **work order dashboard** visible so the audience sees work orders appear live when the agent creates them.
- Save the **action questions** for the finale so the payoff (knowledge + custom capability) lands last.
