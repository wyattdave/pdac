import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createConnectionAsync,
  getConnectorAsync,
  initializePlayerServices,
  isSsoOnlyConnector,
  listConnectionsAsync,
  updateEnvironmentName,
} from '@microsoft/power-apps-actions';
import { createMaafConnectionUrl } from '@microsoft/power-apps-common/services';
import { NodeMsalAuthenticationProvider } from '@microsoft/power-apps-cli/dist/Authentication/NodeMsalAuthenticationProvider.js';
import { CliHttpClient } from '@microsoft/power-apps-cli/dist/HttpClient/CliHttpClient.js';
import open from 'open';

const PORT = Number(process.env.PORT || 4173);
const REGION = process.env.PP_REGION || 'prod';
const SERVICE_RESOURCE = process.env.PP_SERVICE_RESOURCE || 'https://service.powerapps.com/';
const POWER_PLATFORM_RESOURCE = process.env.PP_API_RESOURCE || 'https://api.powerplatform.com';
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const CONNECTION_CREATION_TIMEOUT_MS = 10 * 60 * 1000;
const CONNECTION_CALLBACK_PROTOCOL_VERSION = '1';

const logger = {
  trackActivityEvent() {},
  trackErrorEvent(eventName, eventData) {
    console.error(eventName, eventData || '');
  },
  trackScenario() {
    return {
      scenarioId: randomUUID(),
      complete() {},
      failure() {},
      completeWithError() {},
    };
  },
  stringifyError(err) {
    return err instanceof Error ? err.message : String(err);
  },
};

const authProvider = new NodeMsalAuthenticationProvider();
await authProvider.initAsync(REGION);
const httpClient = new CliHttpClient(authProvider);

let selectedEnvironment = {
  environmentName: process.env.PP_ENVIRONMENT_ID || '',
  orgUrl: normalizeOrgUrl(process.env.PP_ORG_URL || ''),
};

initializePlayerServices({
  logger,
  httpClient,
  region: REGION,
  environmentName: selectedEnvironment.environmentName,
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      await handleApi(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, getStatusCode(error), {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Power Platform PoC running at http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const route = `${req.method || 'GET'} ${url.pathname}`;

  if (route === 'GET /api/status') {
    sendJson(res, 200, {
      region: REGION,
      selectedEnvironment,
      browserConnectionEnabled: isBrowserConnectionEnabled(),
    });
    return;
  }

  if (route === 'POST /api/login') {
    const body = await readJson(req);
    const resource = body.resource || SERVICE_RESOURCE;
    await authProvider.getAccessTokenForResource(resource);
    sendJson(res, 200, {
      tenantId: authProvider.getUserTenantId(),
      resource,
    });
    return;
  }

  if (route === 'GET /api/environments') {
    sendJson(res, 200, await listEnvironments());
    return;
  }

  if (route === 'POST /api/environment') {
    const body = await readJson(req);
    selectedEnvironment = {
      environmentName: requireString(body.environmentName, 'environmentName'),
      orgUrl: normalizeOrgUrl(requireString(body.orgUrl, 'orgUrl')),
    };
    updateEnvironmentName(selectedEnvironment.environmentName);
    sendJson(res, 200, selectedEnvironment);
    return;
  }

  if (route === 'GET /api/tables') {
    requireSelectedEnvironment();
    sendJson(res, 200, await dataverseGet(
      `EntityDefinitions?$select=MetadataId,LogicalName,SchemaName,DisplayName,DisplayCollectionName,EntitySetName,OwnershipType,IsCustomEntity`,
    ));
    return;
  }

  const tableColumnsMatch = url.pathname.match(/^\/api\/tables\/([^/]+)\/columns$/);
  if (req.method === 'GET' && tableColumnsMatch) {
    requireSelectedEnvironment();
    const table = decodeURIComponent(tableColumnsMatch[1]);
    sendJson(res, 200, await dataverseGet(
      `EntityDefinitions(LogicalName='${escapeODataString(table)}')/Attributes?$select=MetadataId,LogicalName,SchemaName,DisplayName,AttributeType,RequiredLevel,IsCustomAttribute`,
    ));
    return;
  }

  if (route === 'POST /api/tables') {
    requireSelectedEnvironment();
    const body = await readJson(req);
    const schemaName = requireString(body.schemaName, 'schemaName');
    const displayName = requireString(body.displayName, 'displayName');
    const collectionName = body.collectionName || `${displayName}s`;
    const primaryNameSchemaName = body.primaryNameSchemaName || `${schemaName}Name`;
    const payload = {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: schemaName,
      DisplayName: label(displayName),
      DisplayCollectionName: label(collectionName),
      Description: label(body.description || ''),
      OwnershipType: body.ownershipType || 'UserOwned',
      HasActivities: Boolean(body.hasActivities),
      HasNotes: Boolean(body.hasNotes),
      PrimaryNameAttribute: {
        SchemaName: primaryNameSchemaName,
        RequiredLevel: managedProperty('None'),
        MaxLength: Number(body.primaryNameMaxLength || 100),
        FormatName: { Value: 'Text' },
        DisplayName: label(body.primaryNameDisplayName || 'Name'),
        Description: label(body.primaryNameDescription || 'Primary name column'),
      },
    };
    const created = await dataversePost('EntityDefinitions', payload);
    await publishAll();
    sendJson(res, 201, created);
    return;
  }

  if (req.method === 'POST' && tableColumnsMatch) {
    requireSelectedEnvironment();
    const table = decodeURIComponent(tableColumnsMatch[1]);
    const body = await readJson(req);
    const payload = buildColumnPayload(body);
    const created = await dataversePost(
      `EntityDefinitions(LogicalName='${escapeODataString(table)}')/Attributes`,
      payload,
    );
    await publishAll();
    sendJson(res, 201, created);
    return;
  }

  const deleteColumnMatch = url.pathname.match(/^\/api\/tables\/([^/]+)\/columns\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteColumnMatch) {
    requireSelectedEnvironment();
    const table = decodeURIComponent(deleteColumnMatch[1]);
    const column = decodeURIComponent(deleteColumnMatch[2]);
    await dataverseDelete(
      `EntityDefinitions(LogicalName='${escapeODataString(table)}')/Attributes(LogicalName='${escapeODataString(column)}')`,
    );
    await publishAll();
    sendJson(res, 200, { deleted: true });
    return;
  }

  if (route === 'POST /api/publish') {
    requireSelectedEnvironment();
    await publishAll();
    sendJson(res, 200, { published: true });
    return;
  }

  if (route === 'GET /api/connections') {
    requireSelectedEnvironment();
    const search = url.searchParams.get('search') || undefined;
    sendJson(res, 200, await listConnectionsAsync(actionContext({ search })));
    return;
  }

  if (route === 'POST /api/connections') {
    requireSelectedEnvironment();
    const body = await readJson(req);
    const connection = await createConnection(body.connectorId, body.displayName);
    sendJson(res, 201, connection);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function createConnection(connectorIdRaw, displayName) {
  const connectorId = normalizeConnectorId(requireString(connectorIdRaw, 'connectorId'));
  const connector = await getConnectorAsync(connectorId, logger);
  if (!connector) {
    throw new HttpError(404, `Connector '${connectorId}' was not found.`);
  }

  if (isSsoOnlyConnector(connector)) {
    try {
      return await createConnectionAsync(actionContext({ connectorId, displayName }));
    } catch (error) {
      if (!isBrowserConnectionEnabled()) {
        throw error;
      }
      console.warn(`Silent connection creation failed; falling back to browser flow: ${String(error)}`);
    }
  } else if (!isBrowserConnectionEnabled()) {
    throw new HttpError(
      400,
      `Connector '${connectorId}' needs an interactive browser flow. Restart with POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION=true or create it in make.powerapps.com.`,
    );
  }

  return startConnectionServer({
    connectorName: connectorId,
    environmentId: selectedEnvironment.environmentName,
    region: REGION,
  });
}

function startConnectionServer(config) {
  const nonce = randomUUID();
  return new Promise((resolve, reject) => {
    const callbackServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      if (url.searchParams.get('nonce') !== nonce) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Connection request verification failed. Please try again.</h2>');
        cleanup();
        resolve({ status: 'cancelled' });
        return;
      }

      const status = url.searchParams.get('status');
      const message = url.searchParams.get('message') || undefined;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(status === 'created'
        ? '<h2>Connection created. You can close this tab.</h2>'
        : `<h2>Connection creation ${status || 'cancelled'}.</h2><p>${escapeHtml(message || '')}</p>`);
      cleanup();

      if (status === 'created') {
        resolve({
          status: 'created',
          name: url.searchParams.get('connectionName') || url.searchParams.get('connectionId'),
          id: url.searchParams.get('connectionId'),
          displayName: url.searchParams.get('displayName'),
        });
      } else if (status === 'error') {
        reject(new HttpError(400, message || 'Connection creation failed in the browser.'));
      } else {
        reject(new HttpError(400, 'Connection creation was cancelled.'));
      }
    });

    callbackServer.listen(0, 'localhost', async () => {
      const address = callbackServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const callbackUrl = `http://localhost:${port}/callback`;
      const playerUrl = createMaafConnectionUrl(config.region, config.environmentId, {
        connector: config.connectorName,
        callbackUrl,
        nonce,
        protocolVersion: CONNECTION_CALLBACK_PROTOCOL_VERSION,
      });

      try {
        await open(playerUrl, { wait: false });
      } catch {
        console.log(`Open this URL to create the connection:\n${playerUrl}`);
      }
    });

    callbackServer.on('error', (error) => {
      cleanup();
      reject(error);
    });

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new HttpError(408, 'Connection creation timed out after 10 minutes.'));
    }, CONNECTION_CREATION_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeoutId);
      callbackServer.close();
    }
  });
}

async function listEnvironments() {
  const attempts = [
    {
      url: 'https://api.powerplatform.com/powerplatform/environments?api-version=2022-03-01-preview',
      authResource: POWER_PLATFORM_RESOURCE,
    },
    {
      url: 'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2020-10-01',
      authResource: SERVICE_RESOURCE,
    },
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const response = await httpClient.get(attempt.url, { authResource: attempt.authResource });
      return {
        value: normalizeEnvironments(response.data),
        source: attempt.url,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new HttpError(502, `Could not list environments. You can still enter an environment manually. ${errors.join(' | ')}`);
}

function normalizeEnvironments(data) {
  const values = Array.isArray(data?.value) ? data.value : Array.isArray(data) ? data : [];
  return values.map((item) => {
    const properties = item.properties || {};
    const linked = properties.linkedEnvironmentMetadata || properties.linkedEnvironment || {};
    return {
      name: item.name || properties.name || properties.environmentName || '',
      displayName: properties.displayName || properties.friendlyName || item.displayName || item.name || '',
      orgUrl: normalizeOrgUrl(linked.instanceUrl || properties.instanceUrl || properties.runtimeEndpoints?.microsoftFlow || ''),
      region: properties.azureRegion || properties.location || item.location || '',
      type: properties.environmentType || properties.environmentSku || '',
    };
  }).filter((env) => env.name);
}

async function dataverseGet(path) {
  const response = await dataverseRequest('GET', path);
  return response.data;
}

async function dataversePost(path, body) {
  const response = await dataverseRequest('POST', path, body);
  return response.data;
}

async function dataverseDelete(path) {
  await dataverseRequest('DELETE', path);
}

async function publishAll() {
  await dataversePost('PublishAllXml', {});
}

function dataverseRequest(method, path, body) {
  const url = `${selectedEnvironment.orgUrl}/api/data/v9.2/${path}`;
  const config = {
    authResource: selectedEnvironment.orgUrl,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  };
  if (body !== undefined) {
    config.body = body;
  }
  return httpClient[method.toLowerCase()](url, config);
}

function buildColumnPayload(body) {
  const schemaName = requireString(body.schemaName, 'schemaName');
  const displayName = requireString(body.displayName, 'displayName');
  const common = {
    SchemaName: schemaName,
    DisplayName: label(displayName),
    Description: label(body.description || ''),
    RequiredLevel: managedProperty(body.requiredLevel || 'None'),
  };

  switch (body.type || 'string') {
    case 'memo':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
        MaxLength: Number(body.maxLength || 2000),
      };
    case 'integer':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
        MinValue: Number(body.minValue ?? -2147483648),
        MaxValue: Number(body.maxValue ?? 2147483647),
      };
    case 'decimal':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
        MinValue: Number(body.minValue ?? -100000000000),
        MaxValue: Number(body.maxValue ?? 100000000000),
        Precision: Number(body.precision || 2),
      };
    case 'boolean':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        OptionSet: {
          TrueOption: { Value: 1, Label: label(body.trueLabel || 'Yes') },
          FalseOption: { Value: 0, Label: label(body.falseLabel || 'No') },
        },
      };
    case 'datetime':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
        Format: body.format || 'DateAndTime',
      };
    case 'string':
    default:
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        MaxLength: Number(body.maxLength || 100),
        FormatName: { Value: body.formatName || 'Text' },
      };
  }
}

function actionContext(actionsParams) {
  return {
    vfs: {},
    authProvider,
    region: REGION,
    environmentName: selectedEnvironment.environmentName,
    actionsParams,
    localFilePaths: {
      powerConfigPath: 'power.config.json',
      schemaPath: '.power/schemas',
      codeGenPath: 'src/generated',
    },
    logger,
    httpClient,
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const fullPath = normalize(join(PUBLIC_DIR, requestedPath));

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const content = await readFile(fullPath);
    res.writeHead(200, { 'Content-Type': contentType(fullPath) });
    res.end(content);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function contentType(path) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  }[extname(path)] || 'application/octet-stream';
}

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
        Label: text,
        LanguageCode: 1033,
      },
    ],
  };
}

function managedProperty(value) {
  return {
    Value: value,
    CanBeChanged: true,
    ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings',
  };
}

function normalizeConnectorId(connectorId) {
  return connectorId.startsWith('shared_') ? connectorId : `shared_${connectorId}`;
}

function requireSelectedEnvironment() {
  if (!selectedEnvironment.environmentName || !selectedEnvironment.orgUrl) {
    throw new HttpError(400, 'Select an environment and org URL first.');
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `Missing required field: ${name}`);
  }
  return value.trim();
}

function normalizeOrgUrl(value) {
  return value ? value.replace(/\/$/, '') : '';
}

function escapeODataString(value) {
  return value.replace(/'/g, "''");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function isBrowserConnectionEnabled() {
  const value = process.env.POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function getStatusCode(error) {
  return error instanceof HttpError ? error.status : 500;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
