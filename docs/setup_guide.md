# Demo Setup Guide

## AI Solution Accelerator — Equipment Knowledge Agent

This guide walks through setting up the full demo environment:

1. **Knowledge** — equipment documents hosted across **two** enterprise sources:
   - **Part of the documents on SharePoint** (the Word documents)
   - **Part of the documents on Azure AI Search** (the PDF documents, indexed from Azure Blob Storage)
2. **Business system** — the **Work Order & Warranty System** ([../workorder-system](../workorder-system)) deployed to **Azure App Service**. It is the source of truth for warranty status and work orders that the agent's Azure Function will call.
3. **Agent** — a **Microsoft Copilot Studio** agent that connects to the knowledge sources (and later, the deployed system via an Azure Function).
4. **Artifact generation** — a **Copilot Cowork plugin** ([../cowork-plugin](../cowork-plugin)) that generates PowerPoint decks/reports from live Work Order & Warranty System data.
5. **(Optional) Business data** — a **Dataverse** table (service contracts, vendors, SLA, cost) so the agent can combine operational API data with enterprise business data in one answer.
6. **Predictive intelligence** — an **Azure AI Foundry** project and agent ([../foundry-agent](../foundry-agent)) that scores failure risk from the same equipment data and is called by the system's `POST /api/foundry/predict` endpoint.

Using two knowledge sources demonstrates that the agent can reason over knowledge no matter where it lives, and the deployed system shows the agent taking real business actions.

> The equipment documents are generated in [../artifacts](../artifacts). See [generate_equipment_docs.py](../artifacts/generate_equipment_docs.py) to regenerate or change the format mix.
> Deploy the Work Order & Warranty System **before** the demo (Part C below), then build/install the Cowork plugin (Part E).

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Microsoft 365 tenant | With SharePoint Online and Copilot Studio access |
| Copilot Studio license | Trial or paid; environment created in the [Copilot Studio portal](https://copilotstudio.microsoft.com) |
| Azure subscription | Owner/Contributor on a resource group |
| Azure AI Search | Basic tier or higher (Semantic ranking requires Basic+) |
| Azure Storage account | To hold the PDF documents for indexing |
| Azure App Service | For the Work Order & Warranty System (provisioned via Bicep in Part C). Defaults to the **F1 Free** tier, which needs no VM quota. |
| Azure AI Foundry | For the predictive maintenance agent (provisioned via Bicep in Part G). Requires quota for a `gpt-4.1-mini` deployment in the chosen region. |
| Node.js 18+ | To run/deploy the Work Order & Warranty System |
| Azure CLI | Required for the Bicep deployment (`az`) |
| Copilot Cowork | A Microsoft 365 account with **Copilot Cowork** access (for the plugin) |
| M365 Agents Toolkit CLI | To package and install the Cowork plugin: `npm install -g @microsoft/m365agentstoolkit-cli` |
| Permissions | Ability to create a SharePoint site/library and Azure resources |
| Tools | Azure Portal access; Azure CLI; optionally Azure Storage Explorer |

### Document split used in this demo

| Source | Format | Documents |
|--------|--------|-----------|
| **SharePoint** | Word (`.docx`) | Soldering Station (CE-SOL-0450), Reflow Soldering Oven (CE-RFO-2100), Automated Optical Inspection System (CE-AOI-2400), Solder Paste Stencil Printer (CE-SPP-2000), Programmable DC Power Supply (CE-PSU-1400), Environmental Test Chamber (CE-ETC-3100), Conformal Coating Machine (CE-CCM-2800) |
| **Azure AI Search** | PDF (`.pdf`) | Digital Storage Oscilloscope (CE-OSC-1200), CO2 Laser Cutter (CE-LAS-3300), Pick and Place Machine (CE-PNP-2200), Wave Soldering Machine (CE-WAV-2600), Function/Arbitrary Waveform Generator (CE-FGN-1300), Bench Digital Multimeter (CE-DMM-1100), X-Ray Inspection System (CE-XRI-3400), ESD-Protected Assembly Workstation (CE-ESD-0100) |

---

## 2. Part A — Host the Word documents on SharePoint

1. Go to the [SharePoint start page](https://www.office.com/launch/sharepoint) and select **Create site** → **Team site**. This option is now under Build on the left rail.
2. Name it, for example, **Contoso Electronics — Maintenance Knowledge** and finish creation. Make it public, selecting public under Privacy Settings.
3. In the site, open the default **Documents** library (or create a new library named `Equipment Docs`).
4. Create a folder such as `Equipment Manuals` (optional) and **Upload** the 7 Word documents listed above from the `artifacts` folder.
5. Wait a few minutes for SharePoint search to crawl and index the new files.
6. Copy and save the **site URL** (for example, `https://contoso.sharepoint.com/sites/EquipmentKnowledge`). You will need it in Copilot Studio.

> Tip: Confirm the documents are searchable by using the SharePoint search box to look for a term such as "soldering station" before continuing.

---

## 3. Part B — Host the PDF documents on Azure AI Search

### 3.1 Create the storage account and upload PDFs

1. In the [Azure Portal](https://portal.azure.com), create a **Storage account** in your resource group with these settings:
   - **Name**: `stcontosoequipdocs` (must be globally unique, 3–24 lowercase letters/numbers; append a few random digits if the name is taken, e.g. `stcontosoequipdocs01`).
   - **Preferred storage type**: **Azure Blob Storage or Azure Data Lake Storage** (this is what Azure AI Search indexes; do **not** pick Azure Files or Other). Leave the hierarchical namespace / Data Lake option **disabled** — flat blob storage works out of the box.
   - **Performance**: **Standard** (general-purpose v2) — recommended; Premium is unnecessary for document storage.
   - **Redundancy**: **Locally-redundant storage (LRS)** — cheapest and sufficient for the demo.
2. After the storage account is created, go to **Data storage → Containers**, create a container named `equipment-docs` (private access).
3. Upload the 8 PDF documents listed above (portal upload or Azure Storage Explorer).

### 3.2 Create the Azure AI Search service

1. Create an **Azure AI Search** resource (Basic tier or higher) in the same region as the storage account.
   - **Service name**: for example `srch-contoso-equipment` (or `contoso-equipment-search`). The name must be globally unique and 2–60 characters, lowercase letters/digits/dashes only, cannot start or end with a dash, and cannot contain consecutive dashes. Append digits if the name is taken (e.g. `srch-contoso-equipment-01`). This name forms the endpoint URL: `https://<service-name>.search.windows.net`.
2. Once deployed, open the service and note the **URL** and, from **Keys**, an **admin key** (used only during setup).

### 3.3 Build the index

You can index with **keyword search** (simplest) or add **vectorization** (semantic/vector retrieval). Keyword search is sufficient for this demo.

**Option A — Keyword search (recommended if you don't have Azure OpenAI):**

1. In the search service, choose **Import data** (classic).
2. **Data source**: select **Azure Blob Storage** → your storage account → the `equipment-docs` container.
3. **Index name**: `equipment-index`.
4. (Optional) Enable **Semantic ranker** for better relevance — this does **not** require Azure OpenAI.
5. Run the wizard to create the **data source**, **index**, and **indexer**.
6. Under **Indexers**, confirm the indexer status is **Success** and documents were indexed.

**Option B — Import and vectorize data (adds embeddings):**

1. In the search service, choose **Import and vectorize data**.
2. **Data source**: select **Azure Blob Storage** → your storage account → the `equipment-docs` container.
3. **Vectorization**: connect an **Azure OpenAI** embedding model (for example, `text-embedding-3-large`).
4. **Index name**: `equipment-index`.
5. Enable **Semantic ranking** if available for richer answers.
6. Run the wizard to create the **data source**, **skillset** (chunking + embeddings), **index**, and **indexer**.
7. Under **Indexers**, confirm the indexer status is **Success** and documents were indexed.

> **Getting "No access to this subscription, or no Azure OpenAI service available under it" in Option B step 3?**
> The vectorization step needs an existing Azure OpenAI resource with a deployed embedding model. Either:
> - **Use Option A** (keyword search) instead — fastest for the demo; or
> - Create an **Azure OpenAI** resource, deploy an embedding model (e.g. `text-embedding-3-large`) in **Azure AI Foundry / Azure OpenAI Studio → Deployments**, then re-run the wizard and select that resource + deployment.

### 3.4 Verify

- Use **Search explorer** in the portal and query a term such as `oscilloscope bandwidth` to confirm results are returned.

---

## 4. Part C — Deploy and test the Work Order & Warranty System

The [../workorder-system](../workorder-system) app tracks work orders and is the **source of truth for warranty**. Deploy it **before** the demo so the agent's Azure Function has a live API to call. Full details are in [../workorder-system/README.md](../workorder-system/README.md).

### 4.1 Provision infrastructure (Bicep)

From the repository root:

```powershell
# Sign in and select the subscription
az login
az account set --subscription "<your-subscription-id>"

# Create a resource group
az group create -n rg-contoso-workorders -l westus2

# Deploy App Service + Application Insights
az deployment group create `
  -g rg-contoso-workorders `
  -f workorder-system/infra/main.bicep `
  -p workorder-system/infra/main.parameters.json
```

Record the deployment outputs: **`webAppName`**, **`webAppUrl`**, and **`apiBaseUrl`**.

> **Defaults to the free tier.** The Bicep uses the **F1 (Free)** App Service Plan SKU, which runs on shared compute and needs no VM quota — ideal for a demo. Trade-offs: no "Always On" (the app cold-starts after idling) and ~60 CPU-minutes/day.
>
> **Hit a quota error like `Current Limit (Total VMs): 0`?** That happens with the dedicated `B1` tier when your subscription has no App Service VM quota in the region. Either keep the `F1` default, request a quota increase (see https://aka.ms/antquotahelp), or try another region (`az group create -l <region>`). To switch tiers, set `appServicePlanSku` in [../workorder-system/infra/main.parameters.json](../workorder-system/infra/main.parameters.json) (allowed: `F1`, `B1`, `B2`, `S1`, `P0v3`, `P1v3`).

### 4.2 Publish the application code

From the `workorder-system` folder:

```powershell
cd workorder-system
az webapp up `
  --name <webAppName-from-output> `
  --resource-group rg-contoso-workorders `
  --runtime "NODE:22-lts"
```

`SCM_DO_BUILD_DURING_DEPLOYMENT=true` (set by Bicep) runs `npm install` on the server during deployment.

### 4.3 Test the system

1. Open **`webAppUrl`** in a browser to view the dashboard (equipment, warranty status, and work orders).
2. Test the **warranty** endpoint (source of truth for the agent):

   ```powershell
   Invoke-RestMethod "<apiBaseUrl>/equipment/CE-OSC-1200/warranty"
   ```

   Expect JSON with `"underWarranty": true` and a `daysRemaining` value.
3. Create a **work order** and confirm it appears on the dashboard:

   ```powershell
   Invoke-RestMethod -Method POST "<apiBaseUrl>/workorders" `
     -ContentType "application/json" `
     -Body '{ "assetId": "CE-LAS-3300", "title": "Test work order", "priority": "High", "requestedBy": "Setup Test" }'
   ```
4. List work orders to verify persistence: `Invoke-RestMethod "<apiBaseUrl>/workorders"`.

> On Windows PowerShell, `curl` is often the native `curl.exe`, which ignores `-Method`/`-Headers`/`-Body` (you'll see a `built-in manual was disabled` warning and no POST happens). Use `Invoke-RestMethod` as shown above.

> Keep the **`apiBaseUrl`** handy \u2014 the Azure Function created during the demo will call `.../equipment/{assetId}/warranty` and `.../workorders`.

### 4.4 Seed the demo work-order history

Run this **before every demo**. It loads a curated work-order history from [../workorder-system/data/workorders.seed.json](../workorder-system/data/workorders.seed.json), which gives the predictive maintenance step (Part G) something meaningful to reason over and clears any throwaway tickets created during rehearsals.

The seed data gives the **Wave Soldering Machine (CE-WAV-2600)** five work orders whose failure cadence tightens from 112 → 90 → 49 → 21 days, ending in an open **Critical** yield issue causally linked to an open **High** pump-bearing fault. That accelerating pattern is what drives the Foundry agent to a Critical risk score.

The API stamps `createdAt` to the current time, so the backdated history has to be written to the app's data file directly. SCM basic auth is disabled by policy on this subscription, but the Kudu VFS API accepts **Entra tokens**:

```powershell
# From the repository root
$app = "<webAppName-from-Part-C>"
$tok = az account get-access-token --resource https://management.azure.com --query accessToken -o tsv
$body = Get-Content "workorder-system/data/workorders.seed.json" -Raw

Invoke-WebRequest -Method PUT `
  -Uri "https://$app.scm.azurewebsites.net/api/vfs/data/workorders.json" `
  -Headers @{ Authorization = "Bearer $tok"; "If-Match" = "*"; "Content-Type" = "application/json" } `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

# The store caches work orders in memory at startup, so a restart is required
az webapp restart -g rg-contoso-workorders -n $app
```

Verify (allow ~20 seconds for the F1 tier to cold-start):

```powershell
Invoke-RestMethod "<apiBaseUrl>/stats"
# -> totalWorkOrders : 8, openWorkOrders : 4
```

> The data file lives at `/home/data/workorders.json`, outside `wwwroot`, so `az webapp up` does **not** overwrite it \u2014 redeploys are safe and work orders created during the demo persist until you re-seed.

---

## 5. Part D — Create and connect the Copilot Studio agent

### 5.1 Create the agent

1. Go to [Copilot Studio](https://copilotstudio.microsoft.com) and select your environment. 
2. Create a new **Agent** (start from a description or blank). Suggested name: **Contoso Maintenance Assistant**.
3. Add agent **Instructions**, for example:

   > "You are the Contoso Electronics maintenance assistant. Answer questions about factory equipment using the connected knowledge sources. Provide specifications, maintenance schedules, safety guidance, warranty details, and troubleshooting steps. When asked about warranty status or to create/check a work order, use the connected work order action. Cite the equipment name and asset ID when relevant. If information is not available, say so."

### 5.2 Add SharePoint as a knowledge source

1. On the agent, open **Knowledge → Add knowledge**.
2. Choose **SharePoint**.
3. Paste the **SharePoint site URL** (or specific document library URL) from Part A.
4. Save. The agent will use Microsoft Search/Graph to retrieve from these documents.

### 5.3 Add Azure AI Search as a knowledge source

1. Open **Knowledge → Add knowledge** again.
2. Choose **Azure AI Search** (Advanced/enterprise knowledge source).
3. Provide:
   - **Search service endpoint** (URL from step 3.2)
   - **Index name**: `equipment-index`
   - **Authentication**: API key (paste the admin/query key) or managed identity
   - The **content**, **title**, and **vector** fields as prompted by the connector.
4. Save.

> If your environment does not expose Azure AI Search as a native knowledge source, add it as a **custom connector / tool** or via a **Power Platform connector**, pointing to the same index.

### 5.4 Configure and test

1. Set **Generative answers** to use the connected knowledge sources; ensure **web search** is disabled (or restricted) so answers come from your documents.
2. In the **Test** pane, ask a mix of questions that hit both sources (see [demo_guide.md](./demo_guide.md)).
3. Confirm answers cite equipment content and that both SharePoint and Azure AI Search sources return results.

### 5.5 Publish

1. Select **Publish** to make the agent available.
2. Optionally add channels (Teams, custom website) as needed for the demo.

---

## 6. Part E — Build and install the Copilot Cowork plugin

The [../cowork-plugin](../cowork-plugin) package lets **Copilot Cowork** generate PowerPoint decks/reports from live Work Order & Warranty System data. It connects to the system's `/mcp` endpoint (deployed in Part C). Full details are in [../cowork-plugin/README.md](../cowork-plugin/README.md).

### 6.1 Point the connector at your deployed system

Edit [../cowork-plugin/manifest.json](../cowork-plugin/manifest.json) and replace the `mcpServerUrl` placeholder with your deployed system's MCP endpoint (the `webAppUrl` from Part C + `/mcp`):

```json
"mcpServerUrl": "https://<your-workorder-app>.azurewebsites.net/mcp"
```

### 6.2 Package the plugin

From the `cowork-plugin` folder (all files must be at the zip **root**):

```powershell
cd cowork-plugin
Compress-Archive -Path manifest.json, color.png, outline.png, mcp-tool-description.json, skills -DestinationPath contoso-equipment-insights.zip -Force
```

### 6.3 Install (sideload) with the Agents Toolkit CLI

```powershell
npm install -g @microsoft/m365agentstoolkit-cli
atk --version
atk auth login
atk install --file-path "./contoso-equipment-insights.zip" --scope Personal
```

A successful install returns a `TitleId` and `AppId` \u2014 save them for updates/uninstall.

> For a tenant-wide rollout instead: **M365 admin center → Manage apps → Upload custom app**, then it appears under **Cowork → Sources & Skills → Plugins → Discover**.

### 6.4 Enable and test

1. Open **Copilot Cowork → Sources & Skills → Plugins** and enable **Contoso Equipment Insights**.
2. Prompt: *"Create a PowerPoint deck summarizing our equipment warranty status and open work orders."*
3. Confirm the deck is generated with real asset IDs and warranty data (proves the MCP connector is reachable).

> If Cowork can't reach the connector, verify the deployed system's `/mcp` endpoint responds and that the `mcpServerUrl` in the manifest is correct.

---

## 7. Part F — (Optional) Add Dataverse business data

This optional part sets up a **Dataverse** table so the demo can show the agent **combining data from two sources** — the live Work Order & Warranty System API (warranty, work orders) **and** Dataverse business context (vendors, service contracts, SLA, renewal cost). Keyed on the same `AssetId`, the agent can join them in a single answer. The talk track and live Copilot Studio wiring are in [demo_guide.md](./demo_guide.md) ("Adding Dataverse business data").

### 7.1 Create the `Equipment Service Contract` table

Create a Dataverse table with these columns (the equipment API deliberately does **not** hold these fields, which is what makes the "two systems, one answer" story work):

| Column | Type | Notes |
|--------|------|-------|
| `AssetId` | Text (Primary/Alternate key) | Join key, e.g. `CE-LAS-3300`. |
| `EquipmentName` | Text | Friendly name for readability. |
| `VendorName` | Text | Service vendor. |
| `VendorContactEmail` | Email | Vendor dispatch/support email. |
| `ContractStatus` | Choice / Text | `Active`, `Expired`, or `None`. |
| `RenewalCost` | Currency | Cost to renew the service contract. |
| `Currency` | Text | e.g. `USD`. |
| `SlaResponseHours` | Whole Number | Contractual response time in hours. |
| `LastServiceDate` | Date Only | Last on-site service. |
| `NextServiceDue` | Date Only | Next scheduled service. |
| `AnnualDowntimeCostEstimate` | Currency | Business impact talk-track figure. |

### 7.2 Load the sample data

Sample rows are in [../dataverse/equipment-service-contracts.csv](../dataverse/equipment-service-contracts.csv). They use the same asset IDs as the equipment data, and the three **expired-warranty** assets (CE-LAS-3300, CE-WAV-2600, CE-SOL-0450) intentionally have **Expired** contracts to drive the renewal story.

1. Go to the [Power Apps maker portal](https://make.powerapps.com) in the **same environment** as your agent.
2. **Tables → Import → Import data from Excel/CSV**, and upload [../dataverse/equipment-service-contracts.csv](../dataverse/equipment-service-contracts.csv). Let it create a new table named **Equipment Service Contract**.
3. Map the columns to the types above; set **`AssetId`** as an **alternate key** (Tables → the table → **Keys → New key**) so lookups by asset ID are reliable.
4. **Save & publish** the table.

### 7.3 Verify

- In the maker portal, open the table's data view and confirm all 15 rows loaded and that the expired-warranty assets show `ContractStatus = Expired`.

> The Dataverse connector is added to the agent **live during the demo** — see [demo_guide.md](./demo_guide.md) for those steps and the cross-source sample questions.

---

## 8. Part G — Deploy the Azure AI Foundry predictive maintenance agent

This part provisions an **Azure AI Foundry** project and the **Predictive Maintenance Insights** agent ([../foundry-agent](../foundry-agent)), then wires it to the Work Order & Warranty System so `POST {apiBaseUrl}/foundry/predict` returns a live risk score. It powers run-of-show step 6, where Foundry, GitHub Copilot, and Copilot Studio all appear in one user turn. Full details: [../foundry-agent/README.md](../foundry-agent/README.md).

> **Prerequisite:** Part C is complete (the App Service is deployed and you have its `webAppName`).

### 8.1 Provision the Foundry resource, project, and model

Deploy into the **same resource group** as the Work Order & Warranty System so everything tears down together.

```powershell
# From the repository root
az deployment group create `
  -g rg-contoso-workorders `
  -f foundry-agent/infra/main.bicep `
  -p foundry-agent/infra/main.parameters.json
```

Record the **`projectEndpoint`** output, e.g. `https://aif-contosowo-xxxx.services.ai.azure.com/api/projects/proj-predictive-maintenance`.

> **Region.** The template defaults to `eastus` and restricts `location` to regions that carry `gpt-4.1-mini`. The Foundry resource does **not** have to match the App Service region — if Part C landed in `westus2`, leave this at `eastus`.
>
> **Getting `ServiceModelDeprecating`?** Azure blocks new deployments of models that are being retired. List what is currently deployable and update `modelName` / `modelVersion` in [../foundry-agent/infra/main.parameters.json](../foundry-agent/infra/main.parameters.json):
>
> ```powershell
> az cognitiveservices model list -l eastus `
>   --query "[?kind=='AIServices' && contains(model.name, 'mini')].{name:model.name, version:model.version}" -o table
> ```
>
> **Cost.** `GlobalStandard` is pay-as-you-go with no reserved capacity (there is no free tier for `AIServices`). The demo makes a handful of small calls.
>
> API keys are disabled on the resource (`disableLocalAuth: true`) — everything authenticates through Entra ID.

### 8.2 Grant access to the agent

Re-run the deployment with the Web App's managed identity so it gets the **Foundry User** role (role ID `53ca6127-db72-4b80-b1b0-d745d6d5456d`, formerly named *Azure AI User*):

```powershell
$principalId = az webapp identity show `
  -g rg-contoso-workorders `
  -n <webAppName-from-Part-C> `
  --query principalId -o tsv

az deployment group create `
  -g rg-contoso-workorders `
  -f foundry-agent/infra/main.bicep `
  -p foundry-agent/infra/main.parameters.json `
  -p webAppPrincipalId=$principalId
```

**Your own account needs the same role** to create the agent in 8.3. Assign it by role ID — `--role "Azure AI User"` fails because the role was renamed:

```powershell
$me = az ad signed-in-user show --query id -o tsv
$scope = az cognitiveservices account show -g rg-contoso-workorders -n <foundryResourceName> --query id -o tsv
az role assignment create --assignee-object-id $me --assignee-principal-type User `
  --role "53ca6127-db72-4b80-b1b0-d745d6d5456d" --scope $scope
```

### 8.3 Create the agent

```powershell
cd foundry-agent
npm install
$env:FOUNDRY_PROJECT_ENDPOINT = "<projectEndpoint from 8.1>"
npm run create-agent
```

The agent is referenced by **name** (`predictive-maintenance-insights`), not by an ID. Its system prompt lives in [../foundry-agent/agent/instructions.md](../foundry-agent/agent/instructions.md) — re-run the script after editing it to publish a new version of the agent.

Optionally smoke-test Foundry on its own, before involving the App Service:

```powershell
npm run test-agent
```

### 8.4 Wire it into the Work Order & Warranty System

```powershell
az webapp config appsettings set `
  -g rg-contoso-workorders `
  -n <webAppName-from-Part-C> `
  --settings `
    FOUNDRY_PROJECT_ENDPOINT="<projectEndpoint>" `
    FOUNDRY_AGENT_NAME="predictive-maintenance-insights"
```

(Equivalently, set the `foundryProjectEndpoint` / `foundryAgentName` parameters in [../workorder-system/infra/main.parameters.json](../workorder-system/infra/main.parameters.json) and redeploy Part C.)

Then redeploy the app code so the `/api/foundry/predict` route is live:

```powershell
cd workorder-system
az webapp up --name <webAppName-from-Part-C> --resource-group rg-contoso-workorders --runtime "NODE:22-lts"
```

### 8.5 Verify

```powershell
# Expect foundryConfigured : True
Invoke-RestMethod "<apiBaseUrl>/health"

Invoke-RestMethod -Method POST "<apiBaseUrl>/foundry/predict" `
  -ContentType "application/json" `
  -Body '{ "assetId": "CE-LAS-3300" }'
```

Expect a `riskScore`, `riskLevel`, `recommendedAction`, and **`"source": "azure-ai-foundry"`**.

With the seed data from 4.4 loaded, the four demo assets should land roughly here — scores vary slightly per run, but the **levels** should be stable:

| Asset | Score | Level | Warranty | Role in the demo |
|-------|-------|-------|----------|------------------|
| CE-WAV-2600 (Wave Soldering Machine) | ~95 | Critical | Expired | The chaining question — prediction feeds `createWorkOrder`. |
| CE-LAS-3300 (CO2 Laser Cutter) | ~90 | Critical | Expired | The headline predictive question. |
| CE-SOL-0450 (Soldering Station) | ~35 | Moderate | Expired | Middle case. |
| CE-OSC-1200 (Oscilloscope) | ~15 | Low | Active | The contrast case — run it back to back with a Critical one. |

> If every asset scores Low, the work-order history is missing — re-run step 4.4.

> If `source` is `local-heuristic`, the app fell back to its built-in deterministic score. Check the two app settings and the role assignment from 8.2, and read `fallbackReason` in the response. The demo still works either way — but for the Foundry story you want `azure-ai-foundry`.
---

## 9. Prepare for the "Extend with code" step

During the demo you build an **Azure Function** that calls the Work Order & Warranty System deployed in Part C, then add it as a tool in Copilot Studio. To be ready:

- Have the **`apiBaseUrl`** from Part C available. The Function will call:
  - `GET  {apiBaseUrl}/equipment/{assetId}/warranty` \u2014 check warranty.
  - `POST {apiBaseUrl}/workorders` \u2014 create a work order.
  - `GET  {apiBaseUrl}/workorders?assetId={assetId}` \u2014 look up existing work orders.
- Ensure you have the **Azure Functions** extension in VS Code and are signed in to Azure.
- Note the **asset IDs** (e.g., `CE-OSC-1200`, `CE-LAS-3300`) used in demo questions.

See [demo_guide.md](./demo_guide.md) for the full run-of-show and sample questions.

---

## 10. Teardown

After the demo, to avoid charges:

- Delete the resource group holding the Work Order & Warranty System (`rg-contoso-workorders`) and the Azure Function. This also removes the Azure AI Foundry resource, project, and model deployment if you deployed Part G into the same group.
- Delete the Azure AI Search service and storage account (or their resource group).
- Uninstall the Cowork plugin: `atk uninstall --title-id <TitleId>` (or remove it from the M365 admin center), using the `TitleId` saved during install.
- If you added Part F, delete the **Equipment Service Contract** Dataverse table from the Power Apps maker portal.
- Optionally remove the SharePoint library and unpublish the Copilot Studio agent.
