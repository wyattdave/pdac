# Power Platform Local PoC

This is a local proof of concept for managing Dataverse metadata and Power Platform connections from a static browser UI plus a small localhost helper.

## Run

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

Optional environment variables:

```powershell
$env:PORT = "4173"
$env:PP_REGION = "prod"
$env:PP_ENVIRONMENT_ID = "<environment-id>"
$env:PP_ORG_URL = "https://<org>.crm.dynamics.com"
$env:POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION = "true"
npm start
```

## What Works

- Sign in through the Microsoft CLI package's MSAL flow.
- Try to list Power Platform environments.
- Manually select an environment with environment ID and Dataverse org URL.
- View Dataverse tables.
- View columns for a selected table.
- Create Dataverse tables.
- Add custom text, multiline text, integer, decimal, boolean, and date/time columns.
- Remove custom columns.
- List connections through the Microsoft Power Apps action package.
- Create SSO-only connections through `createConnectionAsync`.
- Create interactive connections through the local browser callback flow when `POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION=true`.

## Notes

The helper intentionally keeps tokens server-side and proxies Dataverse metadata operations. That is more reliable than direct browser calls because it avoids CORS surprises and does not expose access tokens to frontend JavaScript.

Some connectors still may need to be created in `https://make.powerapps.com` depending on the connector and tenant behavior. The Microsoft package marks browser-based connection creation as opt-in while that flow stabilizes.
