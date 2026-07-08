# Demo Setup Guide

## AI Solution Accelerator — Equipment Knowledge Agent

This guide walks through hosting the Contoso Electronics equipment documents across **two** enterprise knowledge sources and connecting both to a **Microsoft Copilot Studio** agent:

- **Part of the documents on SharePoint** (the Word documents)
- **Part of the documents on Azure AI Search** (the PDF documents, indexed from Azure Blob Storage)

Using two sources demonstrates that the agent can reason over knowledge no matter where it lives.

> The equipment documents are generated in [../artifacts](../artifacts). See [generate_equipment_docs.py](../artifacts/generate_equipment_docs.py) to regenerate or change the format mix.

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Microsoft 365 tenant | With SharePoint Online and Copilot Studio access |
| Copilot Studio license | Trial or paid; environment created in the [Copilot Studio portal](https://copilotstudio.microsoft.com) |
| Azure subscription | Owner/Contributor on a resource group |
| Azure AI Search | Basic tier or higher (Semantic ranking requires Basic+) |
| Azure Storage account | To hold the PDF documents for indexing |
| Permissions | Ability to create a SharePoint site/library and Azure resources |
| Tools | Azure Portal access; optionally Azure CLI and Azure Storage Explorer |

### Document split used in this demo

| Source | Format | Documents |
|--------|--------|-----------|
| **SharePoint** | Word (`.docx`) | Soldering Station (CE-SOL-0450), Reflow Soldering Oven (CE-RFO-2100), Automated Optical Inspection System (CE-AOI-2400), Solder Paste Stencil Printer (CE-SPP-2000), Programmable DC Power Supply (CE-PSU-1400), Environmental Test Chamber (CE-ETC-3100), Conformal Coating Machine (CE-CCM-2800) |
| **Azure AI Search** | PDF (`.pdf`) | Digital Storage Oscilloscope (CE-OSC-1200), CO2 Laser Cutter (CE-LAS-3300), Pick and Place Machine (CE-PNP-2200), Wave Soldering Machine (CE-WAV-2600), Function/Arbitrary Waveform Generator (CE-FGN-1300), Bench Digital Multimeter (CE-DMM-1100), X-Ray Inspection System (CE-XRI-3400), ESD-Protected Assembly Workstation (CE-ESD-0100) |

---

## 2. Part A — Host the Word documents on SharePoint

1. Go to the [SharePoint start page](https://www.office.com/launch/sharepoint) and select **Create site** → **Team site**.
2. Name it, for example, **Contoso Electronics — Maintenance Knowledge** and finish creation.
3. In the site, open the default **Documents** library (or create a new library named `Equipment Docs`).
4. Create a folder such as `Equipment Manuals` (optional) and **Upload** the 7 Word documents listed above from the `artifacts` folder.
5. Wait a few minutes for SharePoint search to crawl and index the new files.
6. Copy and save the **site URL** (for example, `https://contoso.sharepoint.com/sites/EquipmentKnowledge`). You will need it in Copilot Studio.

> Tip: Confirm the documents are searchable by using the SharePoint search box to look for a term such as "soldering station" before continuing.

---

## 3. Part B — Host the PDF documents on Azure AI Search

### 3.1 Create the storage account and upload PDFs

1. In the [Azure Portal](https://portal.azure.com), create a **Storage account** (Standard, LRS is fine) in your resource group.
2. Under **Data storage → Containers**, create a container named `equipment-docs` (private access).
3. Upload the 8 PDF documents listed above (portal upload or Azure Storage Explorer).

### 3.2 Create the Azure AI Search service

1. Create an **Azure AI Search** resource (Basic tier or higher) in the same region as the storage account.
2. Once deployed, open the service and note the **URL** and, from **Keys**, an **admin key** (used only during setup).

### 3.3 Build the index with "Import and vectorize data"

1. In the search service, choose **Import and vectorize data** (or **Import data** for a classic keyword index).
2. **Data source**: select **Azure Blob Storage** → your storage account → the `equipment-docs` container.
3. **Vectorization (optional but recommended)**: connect an **Azure OpenAI** embedding model (for example, `text-embedding-3-large`) to enable semantic/vector retrieval.
4. **Index name**: `equipment-index`.
5. Enable **Semantic ranking** if available for richer answers.
6. Run the wizard to create the **data source**, **skillset** (chunking + embeddings), **index**, and **indexer**.
7. Under **Indexers**, confirm the indexer status is **Success** and documents were indexed.

### 3.4 Verify

- Use **Search explorer** in the portal and query a term such as `oscilloscope bandwidth` to confirm results are returned.

---

## 4. Part C — Create and connect the Copilot Studio agent

### 4.1 Create the agent

1. Go to [Copilot Studio](https://copilotstudio.microsoft.com) and select your environment.
2. Create a new **Agent** (start from a description or blank). Suggested name: **Contoso Maintenance Assistant**.
3. Add agent **Instructions**, for example:

   > "You are the Contoso Electronics maintenance assistant. Answer questions about factory equipment using the connected knowledge sources. Provide specifications, maintenance schedules, safety guidance, warranty details, and troubleshooting steps. Cite the equipment name and asset ID when relevant. If information is not in the knowledge sources, say so."

### 4.2 Add SharePoint as a knowledge source

1. On the agent, open **Knowledge → Add knowledge**.
2. Choose **SharePoint**.
3. Paste the **SharePoint site URL** (or specific document library URL) from Part A.
4. Save. The agent will use Microsoft Search/Graph to retrieve from these documents.

### 4.3 Add Azure AI Search as a knowledge source

1. Open **Knowledge → Add knowledge** again.
2. Choose **Azure AI Search** (Advanced/enterprise knowledge source).
3. Provide:
   - **Search service endpoint** (URL from step 3.2)
   - **Index name**: `equipment-index`
   - **Authentication**: API key (paste the admin/query key) or managed identity
   - The **content**, **title**, and **vector** fields as prompted by the connector.
4. Save.

> If your environment does not expose Azure AI Search as a native knowledge source, add it as a **custom connector / tool** or via a **Power Platform connector**, pointing to the same index.

### 4.4 Configure and test

1. Set **Generative answers** to use the connected knowledge sources; ensure **web search** is disabled (or restricted) so answers come from your documents.
2. In the **Test** pane, ask a mix of questions that hit both sources (see [demo_guide.md](./demo_guide.md)).
3. Confirm answers cite equipment content and that both SharePoint and Azure AI Search sources return results.

### 4.5 Publish

1. Select **Publish** to make the agent available.
2. Optionally add channels (Teams, custom website) as needed for the demo.

---

## 5. (Optional) Prepare for the "Extend with code" step

The demo later adds an **Azure Function** (for example, warranty check or work order creation) as a tool. To be ready:

- Note the **asset IDs** and **warranty expiry** dates from the documents (used by the function).
- Ensure you have a resource group and the Azure Functions extension in VS Code.

See [demo_guide.md](./demo_guide.md) for the full run-of-show and sample questions.

---

## 6. Teardown

After the demo, to avoid charges:

- Delete the Azure AI Search service, storage account, and any Azure Function/App resources (or delete the entire resource group).
- Optionally remove the SharePoint library and unpublish the Copilot Studio agent.
