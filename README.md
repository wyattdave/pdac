# PDAC - Power DevBox Admin Center

Settings by function not by environment.
![home](screenshots/home.png)
PDAC is a small local admin app for working across Power Platform and Dataverse environments with a functional hierarchy instead of environment. It helps with authentication, users and teams, connections, security roles, solution inspection, solution export/import, solution component settings, and admin telemetry for AI Flow, Flow Runs, and Agent Sessions.

## Run

Run directly from npm:

```powershell
npx powerdevbox-admin
```

Or install/link it locally and run the `powerdevbox-admin` or `pdac` command:

```powershell
npm link
powerdevbox-admin
```

For development from this checkout:

```powershell
npm start
```

Open:

```text
http://localhost:4280
```

Optional startup values:

```powershell
$env:SECURITY_ROLES_PORT = "4280"
$env:PP_REGION = "prod"
$env:PP_ENVIRONMENT_ID = "Default-00000000-0000-0000-0000-000000000000"
$env:PP_ORG_URL = "https://org.crm.dynamics.com"
$env:POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION = "true"
powerdevbox-admin
```

`POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION=true` enables the interactive local browser callback flow for connectors that cannot be created silently.

## Functions

- **Home**: quick guide for each admin function.
- **Environment and Auth**: sign in, switch accounts, load environments, choose the active environment, and copy the selected environment details.
- **Users and Teams**: list environment users and teams, force-sync an Entra user into Dataverse, create Dataverse teams, add loaded users to a selected team, and assign security roles to users or teams.
- **Connections**: list environment connections with connector, owner, and health, filter by text or broken state, show only the selected account's connections, open broken owned connections for repair, and delete connections.
- **Roles**: create roles, download editable permission workbooks or CSVs, upload edited permissions, and rename editable root roles.
- **Solutions**: list and filter solutions, filter publishers, open the solution in Power Automate, list components, export as managed or unmanaged, and stage a deployment.
- **AI Flow**: inspect AI usage events, sort by owner or consumption details, and view totals by flow or model with Copilot Studio and AI Builder cost breakdowns.
- **Flow Runs**: list cloud flow runs, filter by status or trigger, and view per-flow totals for run count, success count, fail count, and total run time.
- **Agent Sessions**: browse Dataverse conversation transcripts and load a sanitized transcript view for any session.
- **Tables**: list Dataverse custom or all tables, inspect custom or all columns, generate Mermaid relationship diagrams, and export table-design workbooks.
- **Solution component actions**: manage supported components from the solution component list.
- **Import**: analyze a solution ZIP, map connection references, set environment variable values, download/import settings JSON, and import the solution.

## Users and Teams

1. Sign in and select an environment.
2. Open **Users and Teams**.
3. Click **Load users and teams**.
4. Use **Add user** with the user's Microsoft Entra object ID to request Dataverse user sync.
5. Use **Create team** to create an owner, access, security group, or Office group team.
6. Select a team, then add loaded enabled users as members.
7. Select **Assign role** from a loaded user or team row, then search for and choose the security role in the popup.

Adding a user uses the supported Power Platform admin force-sync pattern. The user must already exist in Microsoft Entra ID and must meet the environment requirements such as license, sign-in status, and environment security group membership.

Role assignment uses the Dataverse user-role and team-role associations. When you choose a root role, PDAC assigns the matching inherited role copy for the selected user's or team's business unit.

## Connections

1. Sign in and select an environment.
2. Open **Connections**.
3. Click **Load connections**.
4. Use the search box to filter by connection name, connector, owner, ID, or status.
5. Use **My connections only** or **Broken only** to narrow the list.
6. For a broken connection owned by the selected account, use **Broken - Click to Fix** to open the connection in Power Apps and re-authenticate it.
7. Use **Delete** to remove a connection after confirming. Apps and flows using that connection may stop working.

## Roles

![excel roles](screenshots/security%20roles.png)

1. Sign in and select an environment.
2. Open **Roles** and click **Load roles**.
3. Select or create a role.
4. Download the table permissions file or misc privileges file.
5. Edit the permission columns in Excel.
6. Upload the edited file to apply the changes.

Valid scope values:

- `none`
- `user`
- `business`
- `parent`
- `org`
- `recordfilter`

Rows with `none` are not assigned to the role. Rows with any other scope are sent to Dataverse using `ReplacePrivilegesRole`.

## Solutions

1. Open **Solutions**.
2. Click **Load solutions**.
3. Filter by name, unmanaged only, or publisher.
4. Select a solution.
5. Click **List components** to inspect solution components.
6. Click **Export solution** to download a ZIP, or **Deploy** to stage the ZIP for the Import tab.

The export action calls the Dataverse `ExportSolution` unbound action.

## Tables

![table diagram](screenshots/database%20diagram.png)

1. Open **Tables**.
2. Choose **Custom** or **All**, then click **Load tables**.
3. Select a table to load columns.
4. Choose **Custom columns** or **All columns**.
5. Click **Create diagram** to open a full-screen Mermaid ER diagram for the selected table and directly related tables through lookup relationships.
6. Use the diagram toolbar to zoom, download SVG or PNG, copy Mermaid, or close the popup.
7. Click **Create table** to open a table-design document, then export it to Excel.

Diagrams and table-design documents show custom columns plus the primary name/name column, `createdby`, and `createdon`. The `createdby` relationship to `systemuser` or `team` is intentionally not drawn.

From the **Solutions** tab, load components for a solution. If the solution contains table components, PDAC shows **Create diagram** and **Create table** actions for the solution. The solution diagram includes all solution tables plus directly related lookup-table dependencies outside the solution, with external dependencies highlighted. The solution table document adds the table display name as the first column.

## Component Actions

Supported actions from the solution component list:

- **Environment variable**: read the related environment variable value, update it, and create the value row if only a default exists.
- **Connection reference**: switch to an existing matching connection or create a connection using the same Microsoft Power Apps action package used by the Power Apps CLI.
- **Flow**: turn on or off by updating the Dataverse `workflows` row with the paired `statecode` and `statuscode`.
- **Flow sharing**: share the workflow row as user or co-owner through Dataverse record sharing.
- **Canvas app sharing**: share as user or co-owner.
- **Code app sharing**: share as user or co-owner.
- **Agent/bot sharing**: share bot records with users or teams as user, co-owner, or analytics viewer. Analytics viewer grants Dataverse read access to the bot row; Copilot Studio analytics may still need product permissions outside record sharing.

Flow run-only users and manual-trigger connection mode are not updated by PDAC because those settings are exposed through the Power Automate Management connector rather than the supported Dataverse workflow row API.

Connection creation is silent for SSO-only connectors where Microsoft supports it. Other connectors need the browser connection flow, so start PDAC with:

```powershell
$env:POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION = "true"
npm start
```

## Import

![deploy solution](screenshots/import.png)

1. Upload a solution ZIP or use **Deploy** from the Solutions tab.
2. Select a target environment.
3. Click **Prepare mappings**.
4. Map connection references to target connections.
5. Review and edit target environment variable values.
6. Import the solution.

Settings files use this shape:

```json
{
  "EnvironmentVariables": [
    {
      "SchemaName": "cr123_MyVariable",
      "Value": "Prod value"
    }
  ],
  "ConnectionReferences": [
    {
      "LogicalName": "cr123_sharedcommondataserviceforapps_abc12",
      "ConnectionId": "00000000000000000000000000000000",
      "ConnectorId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"
    }
  ]
}
```
