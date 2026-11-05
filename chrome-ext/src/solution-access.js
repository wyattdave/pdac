// Solution-wide Dataverse access, adapted from Power-DevBox-Share's
// script.js and agent-sharing.js. Authentication stays in PDAC's request layer.
export const DEFAULT_SOLUTION_ACCESS = 'ReadAccess,WriteAccess,AppendAccess,AppendToAccess,ShareAccess';

export class SolutionAccess {
  constructor(orgUrl, request) {
    this.root = new URL(`${orgUrl.replace(/\/$/, '')}/api/data/v9.2/`);
    this.send = request;
    this.metadata = new Map();
    this.updated = new Set();
    this.warnings = new Set();
    this.principalPrivileges = new Map();
    this.messages = [];
    this.tables = new Set([
      'bot', 'botcomponent', 'botcomponentcollection',
      'environmentvariabledefinition', 'environmentvariablevalue',
      'connectionreference', 'connector', 'workflow', 'msdyn_aimodel',
      'aipluginoperation', 'aiplugin', 'aiplugintitle', 'dvtablesearch',
      'aiplugininstance', 'aipluginexternalschema', 'aipluginexternalschemaproperty',
      'aipluginoperationparameter', 'aipluginoperationresponsetemplate',
      'aipluginconversationstarter', 'aipluginconversationstartermapping',
      'dvtablesearchentity', 'dvtablesearchattribute', 'dvfilesearch',
      'dvfilesearchentity', 'dvfilesearchattribute', 'federatedknowledgeconfiguration',
      'federatedknowledgeentityconfiguration', 'knowledgesourceconsumer', 'knowledgesourceprofile',
      'mcpserver', 'mcptool', 'mcpprompt', 'mcpresource', 'mcpresourcecontent',
    ]);
    this.children = {
      bot: ['botcomponent'], botcomponent: ['botcomponent'], botcomponentcollection: ['botcomponent'],
      environmentvariabledefinition: ['environmentvariablevalue'],
      aiplugin: ['aipluginexternalschema', 'aipluginconversationstarter', 'aipluginconversationstartermapping'],
      aipluginexternalschema: ['aipluginexternalschemaproperty'],
      aipluginoperation: ['aipluginoperationparameter', 'aipluginoperationresponsetemplate'],
      dvtablesearch: ['dvtablesearchentity', 'dvtablesearchattribute'], dvtablesearchentity: ['dvtablesearchattribute'],
      dvfilesearch: ['dvfilesearchentity', 'dvfilesearchattribute'], dvfilesearchentity: ['dvfilesearchattribute'],
      federatedknowledgeconfiguration: ['federatedknowledgeentityconfiguration'], mcpresource: ['mcpresourcecontent'],
    };
  }

  static literal(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  static guid(value) {
    const id = String(value || '').replace(/[{}]/g, '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`Invalid Dataverse record ID: ${value}`);
    }
    return id.toLowerCase();
  }

  log(message) { this.messages.push(message); }

  warn(message) {
    if (this.warnings.has(message)) return;
    this.warnings.add(message);
    this.log(`Warning: ${message}`);
  }

  request(path, method = 'GET', body) {
    const url = new URL(path, this.root);
    if (url.origin !== this.root.origin || !url.pathname.startsWith(this.root.pathname)) {
      throw new Error('Unexpected Dataverse URL.');
    }
    return this.send(url.href, method, body);
  }

  async readAll(path) {
    const records = [];
    const visited = new Set();
    while (path) {
      if (visited.has(path)) throw new Error('Dataverse returned a repeated paging link.');
      visited.add(path);
      const page = await this.request(path);
      if (!Array.isArray(page?.value)) throw new Error('Expected a Dataverse record collection.');
      records.push(...page.value);
      path = page['@odata.nextLink'];
    }
    return records;
  }

  async table(name) {
    if (!this.metadata.has(name)) {
      const select = 'LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,OwnershipType,Privileges';
      const expand = 'OneToManyRelationships($select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,ReferencedEntityNavigationPropertyName),'
        + 'ManyToOneRelationships($select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName),'
        + 'ManyToManyRelationships($select=SchemaName,Entity1LogicalName,Entity2LogicalName,Entity1NavigationPropertyName,Entity2NavigationPropertyName)';
      const metadata = await this.request(`EntityDefinitions(LogicalName=${SolutionAccess.literal(name)})?$select=${select}&$expand=${expand}`);
      if (!metadata?.EntitySetName || !metadata.PrimaryIdAttribute) throw new Error(`Missing table metadata for ${name}.`);
      this.metadata.set(name, metadata);
    }
    return this.metadata.get(name);
  }

  async principal(kind, name, action) {
    if (!['user', 'team'].includes(kind) || !String(name || '').trim()) throw new Error('Choose a recipient type and enter an email or exact team name.');
    const isUser = kind === 'user';
    const value = SolutionAccess.literal(name.trim());
    const filter = isUser ? `(windowsliveid eq ${value} or internalemailaddress eq ${value})` : `name eq ${value}`;
    const columns = isUser ? 'systemuserid,isdisabled' : 'teamid,teamtype';
    const rows = await this.readAll(`${isUser ? 'systemusers' : 'teams'}?$select=${columns}&$filter=${encodeURIComponent(filter)}`);
    if (rows.length !== 1) throw new Error(rows.length ? 'Multiple recipients match. Use a unique email or team name.' : 'Recipient not found in this environment.');
    if (isUser && rows[0].isdisabled) throw new Error('The selected user is disabled.');
    if (!isUser && action === 'owner' && Number(rows[0].teamtype) === 1) throw new Error('Access teams cannot own records. Choose an owner team.');
    const idAttribute = isUser ? 'systemuserid' : 'teamid';
    return { '@odata.type': `Microsoft.Dynamics.CRM.${isUser ? 'systemuser' : 'team'}`, [idAttribute]: SolutionAccess.guid(rows[0][idAttribute]) };
  }

  async discover(botId) {
    const records = new Map();
    const queue = [];
    const add = (table, value) => {
      const id = SolutionAccess.guid(value);
      const key = `${table}:${id}`;
      if (records.has(key)) return;
      const record = { table, id, key };
      records.set(key, record);
      queue.push(record);
    };
    add('bot', botId);
    // Follow only authoring relationships. Never share transcripts, runtime
    // analytics or unrelated agents through reverse dependency relationships.
    for (const record of queue) {
      const metadata = await this.table(record.table);
      record.metadata = metadata;
      const path = `${metadata.EntitySetName}(${record.id})`;
      const lookups = (metadata.ManyToOneRelationships || []).filter((relationship) => this.tables.has(relationship.ReferencedEntity) && relationship.ReferencedEntity !== 'bot');
      const external = (metadata.ManyToOneRelationships || []).filter((relationship) => ['aipluginauth', 'appmodule'].includes(relationship.ReferencedEntity));
      const columns = new Set([metadata.PrimaryIdAttribute]);
      if (metadata.PrimaryNameAttribute) columns.add(metadata.PrimaryNameAttribute);
      for (const relationship of [...lookups, ...external]) columns.add(`_${relationship.ReferencingAttribute}_value`);
      const row = await this.request(`${path}?$select=${[...columns].join(',')}`);
      record.name = row[metadata.PrimaryNameAttribute] || record.id;
      for (const relationship of lookups) {
        const id = row[`_${relationship.ReferencingAttribute}_value`];
        if (id) add(relationship.ReferencedEntity, id);
      }
      for (const relationship of external) {
        if (row[`_${relationship.ReferencingAttribute}_value`]) this.warn(`${relationship.ReferencedEntity} access/credentials must be managed separately.`);
      }
      for (const relationship of metadata.OneToManyRelationships || []) {
        const child = relationship.ReferencingEntity;
        if (!(this.children[record.table] || []).includes(child)) continue;
        const childMetadata = await this.table(child);
        const filter = `_${relationship.ReferencingAttribute}_value eq ${record.id}`;
        const rows = await this.readAll(`${childMetadata.EntitySetName}?$select=${childMetadata.PrimaryIdAttribute}&$filter=${encodeURIComponent(filter)}`);
        for (const row of rows) add(child, row[childMetadata.PrimaryIdAttribute]);
      }
      for (const relationship of metadata.ManyToManyRelationships || []) {
        const first = relationship.Entity1LogicalName === record.table;
        const other = first ? relationship.Entity2LogicalName : relationship.Entity1LogicalName;
        if (!this.tables.has(other) || other === 'bot') continue;
        if (['botcomponent', 'botcomponentcollection'].includes(other) && !['bot', 'botcomponent', 'botcomponentcollection'].includes(record.table)) continue;
        const navigation = first ? relationship.Entity1NavigationPropertyName : relationship.Entity2NavigationPropertyName;
        if (!navigation) throw new Error(`Missing navigation property for ${relationship.SchemaName}.`);
        const otherMetadata = await this.table(other);
        const rows = await this.readAll(`${path}/${navigation}?$select=${otherMetadata.PrimaryIdAttribute}`);
        for (const row of rows) add(other, row[otherMetadata.PrimaryIdAttribute]);
      }
    }
    return [...records.values()];
  }

  async plan(solutionId) {
    const id = SolutionAccess.guid(solutionId);
    await this.request(`solutions(${id})?$select=solutionid`);
    const items = await this.readAll(`solutioncomponents?$select=componenttype,objectid&$filter=_solutionid_value eq ${id}`);
    // Solution component type codes are not necessarily table ObjectTypeCodes.
    const types = new Map([[29, 'workflow'], [371, 'connector'], [372, 'connector'], [380, 'environmentvariabledefinition'], [381, 'environmentvariablevalue']]);
    const supported = ['environmentvariabledefinition', 'environmentvariablevalue', 'connectionreference', 'connector', 'workflow', 'msdyn_aimodel', 'bot', 'botcomponent', 'botcomponentcollection'];
    const filter = supported.map((name) => `LogicalName eq ${SolutionAccess.literal(name)}`).join(' or ');
    const entities = await this.readAll(`EntityDefinitions?$select=LogicalName,ObjectTypeCode&$filter=${encodeURIComponent(filter)}`);
    for (const entity of entities) {
      if (entity.ObjectTypeCode >= 10000) types.set(entity.ObjectTypeCode, entity.LogicalName);
    }
    const components = items.map((item) => ({ table: types.get(Number(item.componenttype)), id: item.objectid, type: item.componenttype }));
    const records = new Map();
    for (const component of components) {
      if (component.table !== 'bot') continue;
      const key = `bot:${SolutionAccess.guid(component.id)}`;
      if (records.has(key)) continue;
      for (const record of await this.discover(component.id)) records.set(record.key, record);
    }
    let unsupported = 0;
    for (const component of components) {
      if (!component.table) {
        unsupported++;
        this.log(`Unsupported component type ${component.type}: ${component.id}`);
        continue;
      }
      const id = SolutionAccess.guid(component.id);
      const key = `${component.table}:${id}`;
      if (records.has(key)) continue;
      if (['botcomponent', 'botcomponentcollection'].includes(component.table)) {
        unsupported++;
        this.log(`Unsupported agent child ${id}: include its containing agent in the solution.`);
        continue;
      }
      records.set(key, { table: component.table, id, key });
    }
    // Resolve every table (and inherited definition) before any mutation.
    for (const record of records.values()) {
      record.metadata = await this.table(record.table);
      if (record.table !== 'environmentvariablevalue') continue;
      const row = await this.request(`${record.metadata.EntitySetName}(${record.id})?$select=_environmentvariabledefinitionid_value`);
      if (!row._environmentvariabledefinitionid_value) throw new Error(`Missing definition for environment-variable value ${record.id}.`);
      const id = SolutionAccess.guid(row._environmentvariabledefinitionid_value);
      const key = `environmentvariabledefinition:${id}`;
      if (!records.has(key)) records.set(key, { table: 'environmentvariabledefinition', id, key });
    }
    return { records: [...records.values()], unsupported, solutionEntries: items.length };
  }

  principalPath(principal) {
    return principal.systemuserid ? `systemusers(${SolutionAccess.guid(principal.systemuserid)})` : `teams(${SolutionAccess.guid(principal.teamid)})`;
  }

  async update(record, principal, action, permissions) {
    if (this.updated.has(record.key)) return 'bundled';
    const metadata = record.metadata;
    if (record.table === 'environmentvariablevalue' && metadata.OwnershipType === 'None') {
      this.log(`${record.table} ${record.id}: inherits definition permissions; no independent ownership/sharing.`);
      this.updated.add(record.key);
      return 'inherited';
    }
    if (!['UserOwned', 'TeamOwned'].includes(metadata.OwnershipType)) {
      if (action === 'share') {
        if (metadata.OwnershipType !== 'OrganizationOwned') throw new Error(`Cannot verify visibility of ${record.table} with ownership ${metadata.OwnershipType}.`);
        const read = (metadata.Privileges || []).find((privilege) => privilege.PrivilegeType === 'Read');
        if (!read) throw new Error(`Unable to verify table Read privileges for ${record.table}.`);
        const path = this.principalPath(principal);
        if (!this.principalPrivileges.has(path)) {
          const func = principal.systemuserid ? 'RetrieveUserPrivileges' : 'RetrieveTeamPrivileges';
          const result = await this.request(`${path}/Microsoft.Dynamics.CRM.${func}()`);
          this.principalPrivileges.set(path, result.RolePrivileges || []);
        }
        if (!this.principalPrivileges.get(path).some((privilege) => privilege.PrivilegeId.toLowerCase() === read.PrivilegeId.toLowerCase())) {
          throw new Error(`Recipient lacks Read privileges for organization-owned ${record.table}; assign an appropriate security role separately.`);
        }
      }
      this.warn(`${record.table} is ${metadata.OwnershipType}: individual sharing/owner changes are unavailable; access is security-role controlled.`);
      this.updated.add(record.key);
      return 'roleControlled';
    }
    if (action === 'owner') {
      const tag = record.table === 'connector' ? '?tag=PowerAppsRP' : '';
      await this.request(`${metadata.EntitySetName}(${record.id})${tag}`, 'PATCH', { 'ownerid@odata.bind': `/${this.principalPath(principal)}` });
    } else {
      const target = { '@odata.type': `Microsoft.Dynamics.CRM.${record.table}`, [metadata.PrimaryIdAttribute]: record.id };
      await this.request('GrantAccess', 'POST', { Target: target, PrincipalAccess: { Principal: principal, AccessMask: permissions } });
      const reference = { '@odata.id': `${metadata.EntitySetName}(${record.id})` };
      const access = await this.request(`${this.principalPath(principal)}/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@target)?@target=${encodeURIComponent(JSON.stringify(reference))}`);
      const actual = new Set((access.AccessRights || '').split(',').map((right) => right.trim()));
      const missing = permissions.split(',').filter((right) => !actual.has(right));
      if (missing.length) throw new Error(`Share submitted, but effective access is missing ${missing.join(', ')}. Check recipient roles before retrying.`);
    }
    this.updated.add(record.key);
    this.log(`${action === 'share' ? 'Shared and verified' : 'Changed owner of'} ${record.table}: ${record.name || record.id}`);
    return 'updated';
  }

  async run({ solutionId, action, recipientKind, recipient, permissions = DEFAULT_SOLUTION_ACCESS }) {
    if (!['share', 'owner'].includes(action)) throw new Error('Choose Share or Change owner.');
    const allowed = new Set(['ReadAccess', 'WriteAccess', 'AppendAccess', 'AppendToAccess', 'ShareAccess', 'AssignAccess', 'DeleteAccess']);
    const rights = [...new Set(String(permissions).split(',').map((right) => right.trim()).filter(Boolean))];
    if (action === 'share' && (!rights.length || rights.some((right) => !allowed.has(right)))) throw new Error('Enter valid, comma-separated Dataverse access rights.');
    const principal = await this.principal(recipientKind, recipient, action);
    const plan = await this.plan(solutionId);
    this.log(`${plan.solutionEntries} solution entries; ${plan.records.length} unique authoring/dependency records; ${plan.unsupported} unsupported entries.`);
    if (plan.records.some((record) => record.table === 'bot')) this.warn('Agent bundles can include linked dependencies outside the solution.');
    this.warn('Environment membership, security roles and licensing are required. Flow co-owner/run permissions, connections, credentials and external data access are separate.');
    const summary = { updated: 0, failed: 0, bundled: 0, roleControlled: 0, inherited: 0, notProcessed: 0, unsupported: plan.unsupported, total: plan.records.length };
    for (const [index, record] of plan.records.entries()) {
      try {
        summary[await this.update(record, principal, action, rights.join(','))]++;
      } catch (error) {
        summary.failed++;
        this.log(`Failed ${record.table} (${record.id}): ${error.message}`);
        if (record.table === 'bot') {
          summary.notProcessed = plan.records.length - index - 1;
          this.log('Stopped after an agent failure to avoid changing its children. Earlier changes are not rolled back.');
          break;
        }
      }
    }
    return { summary, messages: this.messages };
  }
}
