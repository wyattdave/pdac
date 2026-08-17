import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAutomatedSolutionTotalsRows,
  dataverseTableMetadataPath,
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

test('solution totals use the environment metadata count instead of summing solution table components', () => {
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
  }], {
    excludedPublishers: [],
    includeManaged: true,
    includeMicrosoftOwned: true,
  });

  assert.equal(totals['Custom Dataverse tables'], 24);
  assert.equal(Object.hasOwn(totals, '# of Dataverse tables'), false);
});
