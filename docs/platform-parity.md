# Node and Chrome/Edge feature parity

Both distributions use version **0.7.9**. This checkout includes the following
extension updates that were previously missing from the Node distribution.

| Area | Updates brought into Node |
| --- | --- |
| Report dates | Previous calendar month, two months ago, and three-calendar-month presets across all seven selectors; visible date bounds match the actual API request. |
| Trend dates | Data-date/run-date setting, separate `data_date` storage, migration of missing dates, completed-day collection, and monthly baselines. Changing the setting never changes totals. |
| Forecasts | Weekday-aware daily usage, per-environment monthly resets, unknown/missing-day handling, and forecasting across the selected range. Older asynchronous chart responses cannot overwrite a newer selection. |
| Excel trends | `data_date` in templates and exports; old templates/exports without that column remain importable. |
| Chart records | Double-click solution, component, and session bars for searchable 100-row pages. Daily inventories retain IDs and containing solutions; old name-only/latest-inventory fallbacks are labelled. AI-event and flow-run drilldowns remain excluded. |
| Inventory | Summary totals, custom Dataverse-table and dataflow charts, custom-only table counting, and exclusion of the Active Solution from automated inventories. |
| Solution access | Share compatible components or change their owner, including agent authoring dependencies. Both runtimes use the same `SolutionAccess` implementation and account/environment safeguards. |
| Security roles | Read-only Current roles for users/teams, including disabled users and access teams; business-unit names, all assignment pages, current/available grouping, and stale-response protection. Table permission exports include No Permission. |
| Imports | Searchable target-environment combobox with keyboard navigation, invalidation of prepared mappings on target changes, and protection from stale preparation responses. |

The existing table-data browser work is retained in both runtimes. Its UI and API
helpers are shared directly, not duplicated.

## Deliberate platform differences

- **Authentication:** Node uses the Power Apps CLI/MSAL integration; the extension
  uses its browser sign-in and token storage.
- **Persistence:** Node uses durable SQLite/files; the extension uses
  IndexedDB/extension-local storage. Local account credentials and data do not
  automatically synchronize between installations. Excel exports can transfer
  trend totals (not credentials or chart-record inventories).
- **Background work:** Node supports the Windows startup/background task and can
  run with the app page closed. The extension requires Chrome/Edge to be running
  and uses browser alarms.
- **Connection creation:** Node retains silent SSO/interactive CLI creation. The
  extension opens the Power Apps connection-creation page and requires a refresh
  after creation.
- **Environment discovery:** Node retains its Power Platform API plus BAP
  fallback; the extension retains its existing BAP-based discovery.
- **Local storage tools:** Node can inspect its additional weekly/inventory
  SQLite tables; the extension's trend table tools expose its report-total stores.

Existing Node databases retain the run-date view on upgrade; empty installations
default to data dates, like a new extension install. Missing `data_date` values
are filled with the day before `date_ran`, without altering numeric values or
explicit source dates. The preference is persisted transactionally in SQLite and
is not removed by clearing trend records.

## Keeping the platforms aligned

The canonical UI lives in `chrome-ext/app.js`, `chrome-ext/app.html`,
`chrome-ext/styles.css`, and `chrome-ext/src/weekly-report.js`.

```sh
npm run sync:platforms
npm run check:parity
npm test
```

`scripts/sync-platforms.mjs` updates the committed Node UI assets, adapting only
module/library paths and runtime-specific wording. It also synchronizes an
explicit list of shared server functions. Do not copy the whole extension server
over `server.mjs`: the authentication, HTTP, SQLite, filesystem, startup-task, and
connection-creation adapters must stay platform-specific. New API features need
routes and suitable storage adapters in both servers.

`testing/platform-parity.test.mjs` checks generated assets, shared functions,
route coverage, and versions. Calendar/forecast tests exercise both UIs, and the
Node parity tests exercise real SQLite migrations, setting persistence across
restarts, legacy Excel imports, completed-day snapshots, and chart inventories.
GitHub Actions runs the parity check, both test suites, and an npm packaging check.

Tenant-backed authentication, permissions, and administrative writes still need
validation with a test tenant. Automated tests use mocks or isolated local data;
they do not share, reassign, or otherwise modify live Dataverse records.
