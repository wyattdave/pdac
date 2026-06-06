# PDAC - Power DevBox Admin Center

Settings by function not by environment.

PDAC is a small local admin app for working across Power Platform and Dataverse environments. It helps with authentication, users and teams, security roles, solution inspection, solution export/import, and solution component settings.

## Run

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
npm start
```

`POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION=true` enables the interactive local browser callback flow for connectors that cannot be created silently.

## Functions

- **Home**: quick guide for each admin function.
- **Environment and Auth**: sign in, switch accounts, load environments, choose the active environment, and copy the selected environment details.
- **Users and Teams**: list environment users and teams, force-sync an Entra user into Dataverse, create Dataverse teams, add loaded users to a selected team, and assign security roles to users or teams.
- **Roles**: create roles, download editable permission workbooks or CSVs, upload edited permissions, and rename editable root roles.
- **Solutions**: list and filter solutions, filter publishers, open the solution in Power Automate, list components, export as managed or unmanaged, and stage a deployment.
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

## Roles

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

## Component Actions

Supported actions from the solution component list:

- **Environment variable**: read the related environment variable value, update it, and create the value row if only a default exists.
- **Connection reference**: switch to an existing matching connection or create a connection using the same Microsoft Power Apps action package used by the Power Apps CLI.
- **Flow**: turn on or off by updating the Dataverse `workflows` row with the paired `statecode` and `statuscode`.
- **Flow sharing**: share the workflow row as user or co-owner through Dataverse record sharing.
- **Canvas app sharing**: share as user or co-owner.
- **Code app sharing**: share as user or co-owner.
- **Agent/bot sharing**: share supported bot or bot component records as user or co-owner.

Flow run-only users and manual-trigger connection mode are not updated by PDAC because those settings are exposed through the Power Automate Management connector rather than the supported Dataverse workflow row API.

Connection creation is silent for SSO-only connectors where Microsoft supports it. Other connectors need the browser connection flow, so start PDAC with:

```powershell
$env:POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION = "true"
npm start
```

## Import

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
