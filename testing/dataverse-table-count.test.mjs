import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAutomatedSolutionTotalsRows,
  buildSolutionComponentNameLists,
  dataverseTableMetadataPath,
  isDefaultEnvironmentSolution,
  shouldIncludeAutomatedSolution,
} from '../chrome-ext/src/server-core.js';

test('custom Dataverse metadata path uses the maker-compatible table filter', () => {
  const path = dataverseTableMetadataPath('custom');

  assert.match(path, /^EntityDefinitions\?/);
  assert.match(path, /RetrieveAllSettings=true/);
  assert.match(path, /IsIntersect eq false/);
  assert.match(path, /IsLogicalEntity eq false/);
  assert.match(path, /PrimaryNameAttribute ne null/);
  assert.match(path, /PrimaryNameAttribute ne ''/);
  assert.match(path, /ObjectTypeCode gt 0/);
  assert.match(path, /IsCustomizable\/Value eq true or IsCustomEntity eq true or IsManaged eq false or IsMappable\/Value eq true or IsRenameable\/Value eq true/);

  for (const objectTypeCode of [4712, 4724, 9933, 9934, 9935, 9947, 9945, 9944, 9942, 9951, 2016, 9949, 9866, 9867, 9868]) {
    assert.match(path, new RegExp(`ObjectTypeCode ne ${objectTypeCode}`));
  }
});

test('solution totals use distinct solution-scoped component counts instead of summing per-solution components', () => {
  const [totals] = buildAutomatedSolutionTotalsRows([{
    environment: {
      displayName: 'Development',
      environmentId: 'environment-id',
      orgUrl: 'https://example.crm.dynamics.com',
    },
    rows: [
      { ismanaged: false, isvisible: true, '# of Dataverse tables': 700 },
      { ismanaged: true, isvisible: true, '# of Dataverse tables': 647 },
    ],
    totalBeforeFilters: 2,
    dataverseTableCount: 24,
    componentTotals: {
      '# of flows': 15,
      '# of Code Apps': 2,
      '# of Canvas Apps': 9,
      '# of Model Driven Apps': 4,
      '# of Copilot Studio Agents': 3,
      '# of Dataverse tables': 24,
      '# of AI models': 6,
      '# of connection references': 12,
      '# of environment variables': 8,
      '# of dataflows': 5,
    },
  }], {
    excludedPublishers: [],
    includeManaged: true,
    includeMicrosoftOwned: true,
  });

  assert.equal(totals['Custom Dataverse tables'], 24);
  assert.equal(totals['# of flows'], 15);
  assert.equal(totals['# of Canvas Apps'], 9);
  assert.equal(totals['# of connection references'], 12);
  assert.equal(Object.hasOwn(totals, '# of Dataverse tables'), false);
});

test('environment default solutions are excluded from the automated solutions report', () => {
  const options = { excludedPublishers: [], includeManaged: true, includeMicrosoftOwned: true };
  const defaultSolution = { uniquename: 'Default', friendlyname: 'Default Solution', ismanaged: false };
  const cdsDefaultSolution = { uniquename: 'Crdefault', friendlyname: 'Common Data Services Default Solution', ismanaged: false };
  const cdsDefaultSolutionVariant = { uniquename: 'other', friendlyname: 'Common Data Service Default Solution', ismanaged: false };
  const regularSolution = { uniquename: 'contoso_core', friendlyname: 'Contoso Core', ismanaged: false, publisher: { friendlyname: 'Contoso' } };

  assert.equal(isDefaultEnvironmentSolution(defaultSolution), true);
  assert.equal(isDefaultEnvironmentSolution(cdsDefaultSolution), true);
  assert.equal(isDefaultEnvironmentSolution(cdsDefaultSolutionVariant), true);
  assert.equal(isDefaultEnvironmentSolution(regularSolution), false);
  assert.equal(shouldIncludeAutomatedSolution(defaultSolution, options), false);
  assert.equal(shouldIncludeAutomatedSolution(cdsDefaultSolution, options), false);
  assert.equal(shouldIncludeAutomatedSolution(regularSolution, options), true);
});

test('component name lists dedupe by kind and object id and include solution names', () => {
  const lists = buildSolutionComponentNameLists(
    [
      { friendlyname: 'Contoso Core', uniquename: 'contoso_core' },
      { friendlyname: '', uniquename: 'Zebra Tools' },
    ],
    [
      { kind: 'canvasApps', objectId: 'app-1', name: 'Expenses' },
      { kind: 'canvasApps', objectId: 'app-1', name: 'Expenses' },
      { kind: 'canvasApps', objectId: 'app-2', name: 'Approvals' },
      { kind: 'modelDrivenApps', objectId: 'mda-1', name: 'Case Manager' },
      { kind: 'tables', objectId: 'table-1', name: 'Expense Line' },
    ],
  );

  assert.deepEqual(lists.solutions, ['Contoso Core', 'Zebra Tools']);
  assert.deepEqual(lists.canvasApps, ['Approvals', 'Expenses']);
  assert.deepEqual(lists.modelDrivenApps, ['Case Manager']);
  assert.deepEqual(lists.tables, ['Expense Line']);
});
