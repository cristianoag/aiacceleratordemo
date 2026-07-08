# Demo Guide (Run of Show)

## AI Solution Accelerator — 10 Minute Demo

This guide is the presenter script for the demo described in [demo_proposal.md](./demo_proposal.md). It assumes the environment is already configured per [setup_guide.md](./setup_guide.md): equipment documents split across **SharePoint** (Word) and **Azure AI Search** (PDF), both connected to a **Copilot Studio** agent.

---

## Pre-demo checklist

- [ ] Copilot Studio agent (**Contoso Maintenance Assistant**) is published and responding.
- [ ] SharePoint knowledge source returns results (Word documents indexed).
- [ ] Azure AI Search index (`equipment-index`) indexer status is **Success** (PDF documents indexed).
- [ ] Web search is disabled on the agent so answers come from the documents.
- [ ] VS Code open with the repo and GitHub Copilot enabled (for the "extend with code" step).
- [ ] Azure subscription signed in for deploying the Azure Function.
- [ ] Test pane pre-loaded with one warm-up question.

---

## Run of show

### 1. Business challenge (1 min)
Set the scene: a maintenance manager at Contoso Electronics needs an assistant that can both **answer equipment questions** and **take action** (warranty checks, work orders).

### 2. Build the agent — knowledge Q&A (2 min)
- Open the agent in Copilot Studio; show the two connected knowledge sources.
- Ask a question answered by **SharePoint** (Word docs) and one answered by **Azure AI Search** (PDF docs) to prove both are working.

### 3. Extend the agent with code (3 min)
- Switch to VS Code; use GitHub Copilot to generate an **Azure Function** (e.g., `checkWarranty` or `createWorkOrder`).
- Deploy the function to Azure.

### 4. Connect the new capability (2 min)
- Add the Azure Function as a **tool/action** in Copilot Studio.
- Show the agent picking it up immediately.

### 5. End-to-end experience (2 min)
- Ask a question that needs **both** knowledge and the new action (e.g., look up an equipment's details and create a work order).
- The agent reasons over the documents, calls the function, and returns an actionable answer.

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

### D. Action questions (for the Azure Function step)

Use these after the Azure Function tool is connected:

| Question | Capability demonstrated |
|----------|-------------------------|
| Is the digital oscilloscope (CE-OSC-1200) still under warranty? | Warranty check function (warranty expiry 2027-03-14). |
| The laser cutter (CE-LAS-3300) needs service — create a work order. | Work order creation function. |
| The soldering station keeps throwing error E-04. Look up the fix and open a maintenance work order for it. | End-to-end: knowledge retrieval + action. |
| Check the warranty on the wave soldering machine and, if expired, create a work order to renew the service contract. | Reasoning + conditional action. |

---

## Presenter tips

- Start with one **SharePoint** and one **Azure AI Search** question back-to-back to prove both sources work.
- Keep questions specific (include the equipment name or asset ID) for the cleanest, grounded answers.
- If an answer looks generic, confirm web search is disabled and the knowledge sources are healthy.
- Save the **action questions** for the finale so the payoff (knowledge + custom capability) lands last.
