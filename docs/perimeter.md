1.



# Uploading the PDFs when the subscription requires a Network Security Perimeter

A subscription policy blocks public network access on storage accounts — only **"Secured by perimeter"** is allowed. This means you must place the storage account inside a **Network Security Perimeter (NSP)** and add an **inbound access rule** for your client IP before you can upload the equipment PDFs.

Reference values used below (change to match your environment):

| Item | Value |
| --- | --- |
| Subscription | `2617e215-8bbf-41e9-9030-ee9833f3a1b0` |
| Resource group | `AIAcceleratorDemo` |
| Storage account | `stcontosoequipdocs01` |
| Your client IP | `177.182.223.205` |
| Region | same region as the storage account |

---

## 1. Create the Network Security Perimeter

1. In the [Azure Portal](https://portal.azure.com), search for **Network Security Perimeters** and click **+ Create**.
2. **Basics**:
   - **Subscription / Resource group**: `AIAcceleratorDemo`.
   - **Name**: e.g. `nsp-contoso-equipment`.
   - **Region**: the same region as `stcontosoequipdocs01`.
   - A default **profile** (e.g. `defaultProfile`) is created automatically — a profile is the container for the access rules.
3. **Review + create** → **Create**. Wait for deployment to finish.

---

## 2. Associate the storage account with the perimeter

You can do this from either the storage account or the perimeter. From the storage account:

1. Click the storage account `stcontosoequipdocs01`.
2. Go to **Security + networking → Networking**.
3. Click **Manage** under public access and change to **Secured by perimeter**.
4. Under **Network security perimeter**, click **Associate**:
   - **Perimeter**: select `nsp-contoso-equipment`.
   - **Profile**: select the profile (e.g. `defaultProfile`).
   - **Access mode**: choose **Learning** for now (see note below).
5. **Save**.

> **Access mode matters.**
> - **Learning** (transitional) — traffic is **allowed and logged**, so your upload works immediately without any IP rule. Good for getting the demo running.
> - **Enforced** — only traffic matching an inbound rule is allowed; everything else is blocked. Use this once you've added the IP rule in step 3 and want it locked down.

If **Learning** mode is enough for your demo, you can skip step 3 and go straight to **Upload the PDFs**. To lock it down, do step 3 then switch the association to **Enforced**.

---

## 3. Add an inbound access rule for your IP (for Enforced mode)

1. Open the perimeter `nsp-contoso-equipment` → **Profiles** → open your profile.
2. Select **Inbound access rules** → **Add**:
   - **Rule name**: `allow-my-ip`.
   - **Source type**: **IP address ranges**.
   - **Allowed sources**: `177.182.223.205` (or `177.182.223.205/32`).
3. **Save**.
4. Back on the perimeter → **Resources** (associations), set the `stcontosoequipdocs01` association **Access mode** to **Enforced**.
5. Wait ~1–2 minutes for rules to propagate.

> Your public IP can change (VPN/ISP). If uploads fail again later, re-check the IP shown in the 403 error and update this rule.

---

## 4. Upload the PDFs

After Learning mode is on (or your IP rule is active), upload the 8 PDFs from [../artifacts](../artifacts):

```powershell
az storage blob upload-batch `
  --account-name stcontosoequipdocs01 `
  --destination equipment-docs `
  --source .\artifacts `
  --pattern "*.pdf" `
  --auth-mode login
```

`--auth-mode login` uses your Entra ID (needed if the policy also disabled shared-key access). You must have the **Storage Blob Data Contributor** role on the account:

```powershell
az role assignment create `
  --assignee <your-user-object-id-or-upn> `
  --role "Storage Blob Data Contributor" `
  --scope /subscriptions/2617e215-8bbf-41e9-9030-ee9833f3a1b0/resourceGroups/AIAcceleratorDemo/providers/Microsoft.Storage/storageAccounts/stcontosoequipdocs01
```

Or upload via the portal (**Containers → equipment-docs → Upload**) / Azure Storage Explorer once the perimeter allows your IP.


