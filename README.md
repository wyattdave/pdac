# PDAC - Power DevBox Admin Center

Settings by function not by environment.

Small local app for Dataverse environment auth, security-role CSV editing, and solution inspection/export.

## Run

```powershell
cd "security roles"
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
$env:PP_ORG_URL = "https://org.crm.dynamics.com"
npm start
```

## Tabs

- **Home**: quick overview.
- **Environment and Auth**: account-scoped environment picker, manual org URL, sign in, sign in with account picker, and log out.
- **Roles**: edit editable root security roles through CSV files.
- **Solution**: list/filter solutions, inspect components, and export solution ZIP files.

## Role Workflow

1. Sign in.
2. Load environments or manually enter your Dataverse org URL.
3. Select the environment/org URL. The selected environment is remembered for the active account and appears in the header picker.
4. Load roles.
5. Select or create a role.
6. Download the table permissions CSV or the misc privileges CSV.
7. Open it in Excel, edit the permission columns, and save as CSV.
8. Upload the CSV to apply that slice of the role.

Valid `depth` values:

- `none`
- `user`
- `business`
- `parent`
- `org`
- `recordfilter`

Rows with `none` are not assigned to the role. Rows with any other depth are sent to Dataverse using `ReplacePrivilegesRole`.

## CSV Columns

Table CSV columns start with:

```text
Role Name,Role Id,Table,Name,Record owner,Permission type,Create,Read,Write,Delete,Append,Append To,Assign,Share
```

Misc CSV columns start with:

```text
Role Name,Role Id,Display Name,Privilege Name,Privilege Id,Available Scopes,Depth
```

You normally edit only the permission/scope columns, such as `Create`, `Read`, or `Depth`.

## Solution Workflow

1. Open the **Solution** tab.
2. Load solutions.
3. Filter by name, unmanaged only, or selected publishers.
4. Select a solution to view components.
5. Choose managed/unmanaged export and click **Export solution**.

The export button calls the Dataverse `ExportSolution` unbound action and downloads the returned ZIP.
