# Contoso Equipment Insights — Copilot Cowork Plugin

A [Copilot Cowork plugin](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
that lets you generate artifacts (such as **PowerPoint decks** and reports) about
Contoso Electronics factory equipment, using **live data** from the
[Work Order & Warranty System](../workorder-system) via an MCP connector.

## Package contents

```
cowork-plugin/
├── manifest.json                 # M365 Unified App Manifest (v1.28): agentSkills + agentConnectors
├── color.png                     # 192x192 app icon
├── outline.png                   # 32x32 outline icon
├── generate_icons.py             # Regenerates the icons (optional)
└── skills/
    └── generate-equipment-deck/
        ├── SKILL.md              # Workflow that builds the deck from connector data
        └── references/
            └── deck-outline.md   # Slide-by-slide content & styling guidance
```

- **Skill:** `generate-equipment-deck` — teaches Cowork how to build an equipment status deck.
- **Connector:** `contoso-workorder-system` — a remote MCP server (the `/mcp` endpoint of the deployed Work Order & Warranty System) exposing tools: `get_summary`, `list_equipment`, `get_equipment`, `check_warranty`, `list_work_orders`.

## Prerequisites

- The [Work Order & Warranty System](../workorder-system) deployed to Azure App Service (its `/mcp` endpoint is the connector).
- [Microsoft 365 Agents Toolkit CLI](https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/microsoft-365-agents-toolkit-cli): `npm install -g @microsoft/m365agentstoolkit-cli`
- A Microsoft 365 account with **Copilot Cowork** access.

## Build & install

### 1. Set the connector URL

Edit [manifest.json](./manifest.json) and replace the `mcpServerUrl` placeholder
with your deployed system's MCP endpoint:

```json
"mcpServerUrl": "https://<your-workorder-app>.azurewebsites.net/mcp"
```

Use the `webAppUrl` from the Work Order System deployment and append `/mcp`.

### 2. (Optional) Regenerate icons

```powershell
python cowork-plugin/generate_icons.py
```

### 3. Package the plugin (.zip)

From the `cowork-plugin` folder — all files must be at the **root** of the zip:

```powershell
cd cowork-plugin
Compress-Archive -Path manifest.json, color.png, outline.png, mcp-tool-description.json, skills -DestinationPath contoso-equipment-insights.zip -Force
```

### 4. Install (sideload) for personal use

```powershell
npm install -g @microsoft/m365agentstoolkit-cli
atk --version
atk auth login
atk install --file-path "./contoso-equipment-insights.zip" --scope Personal
```

A successful install returns a `TitleId` and `AppId` — save them for updates/uninstall.

> To roll out to the whole tenant instead, upload the `.zip` via **M365 admin center → Manage apps → Upload custom app**, then it appears in **Cowork → Sources & Skills → Plugins → Discover**.

## Use it in Cowork

Open Copilot Cowork, enable the plugin under **Sources & Skills → Plugins**, then prompt, for example:

> "Create a PowerPoint deck summarizing our equipment warranty status and open work orders."

Cowork triggers the `generate-equipment-deck` skill, calls the connector tools to
pull live data, and produces the deck. See
[../docs/demo_guide.md](../docs/demo_guide.md) for the full demo script.

## Notes

- The connector uses `authorization.type: "None"` because the demo `/mcp` endpoint is open. For production, front it with `OAuthPluginVault` or `ApiKeyPluginVault` and register credentials in the Enterprise Token Store.
- The MCP server implementation lives in [../workorder-system/lib/mcp.js](../workorder-system/lib/mcp.js).
