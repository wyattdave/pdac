import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractConnectionReferences,
  extractEnvironmentVariables,
  extractSolutionComponents,
} from '../chrome-ext/src/server-core.js';

const solutionXml = `
<ImportExportXml>
  <SolutionManifest>
    <RootComponents>
      <RootComponent type="29" id="{flow-1}" />
      <RootComponent type="29" id="{flow-2}" />
    </RootComponents>
  </SolutionManifest>
</ImportExportXml>`;

const customizationsXml = `
<ImportExportXml>
  <connectionreferences>
    <connectionreference>
      <connectionreferencelogicalname>ia_DataversePipeline</connectionreferencelogicalname>
      <connectionreferencedisplayname>Dataverse Pipeline</connectionreferencedisplayname>
      <connectorid>/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps</connectorid>
    </connectionreference>
    <connectionreference connectionreferencelogicalname="ia_ApprovalsPipeline" connectionreferencedisplayname="Approvals Pipeline" connectorid="/providers/Microsoft.PowerApps/apis/shared_approvals" />
  </connectionreferences>
  <environmentvariabledefinitions>
    <environmentvariabledefinition>
      <schemaname>ia_PipelineEnvironment</schemaname>
      <displayname>Pipeline Environment</displayname>
      <type>100000000</type>
      <defaultvalue>dev</defaultvalue>
    </environmentvariabledefinition>
    <environmentvariabledefinition schemaname="ia_ApprovalTimeout" displayname="Approval Timeout" type="100000001" defaultvalue="30" />
  </environmentvariabledefinitions>
</ImportExportXml>`;

test('extracts nested and attribute-based deployment settings', () => {
  const xmlTexts = [solutionXml, customizationsXml];
  const references = extractConnectionReferences([], xmlTexts);
  const variables = extractEnvironmentVariables([], xmlTexts);
  const components = extractSolutionComponents(xmlTexts);

  assert.equal(references.length, 2);
  assert.deepEqual(references.map((item) => item.logicalName).sort(), ['ia_ApprovalsPipeline', 'ia_DataversePipeline']);
  assert.equal(variables.length, 2);
  assert.deepEqual(variables.map((item) => item.schemaName).sort(), ['ia_ApprovalTimeout', 'ia_PipelineEnvironment']);
  assert.equal(variables.find((item) => item.schemaName === 'ia_ApprovalTimeout').type, 'number');
  assert.equal(components.length, 2);
});
