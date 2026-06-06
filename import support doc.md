For direct Dataverse Web API import, map it into ComponentParameters.

Deployment settings JSON schema

Microsoft’s deployment settings file uses:

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

Microsoft says this file is passed to Power Platform Build Tools / PAC during import, and PAC can generate it with:

pac solution create-settings --solution-zip solution.zip --settings-file settings.json

Direct ImportSolution API body

ImportSolution has a ComponentParameters parameter described as the list of entities used to overwrite solution values, currently environment variable values and connection references.

Use this body shape:

{
  "OverwriteUnmanagedCustomizations": true,
  "PublishWorkflows": true,
  "CustomizationFile": "<base64 solution zip>",
  "ImportJobId": "00000000-0000-0000-0000-000000000000",
  "ComponentParameters": [
    {
      "@odata.type": "Microsoft.Dynamics.CRM.environmentvariablevalue",
      "schemaname": "cr123_MyVariable",
      "value": "Prod value"
    },
    {
      "@odata.type": "Microsoft.Dynamics.CRM.connectionreference",
      "connectionreferencelogicalname": "cr123_sharedcommondataserviceforapps_abc12",
      "connectionid": "00000000000000000000000000000000",
      "connectorid": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"
    }
  ]
}

connectionid, connectionreferencelogicalname, and connectorid are actual connectionreference columns; connectionid is the API Hub connection ID.
schemaname and value are actual environmentvariablevalue columns.

Safer async/staged pattern

Microsoft’s async staging sample shows the same conceptual mapping:

new Entity("connectionreference")
{
  ["connectionreferencelogicalname"] = ...,
  ["connectionreferencedisplayname"] = ...,
  ["connectorid"] = ...,
  ["connectionid"] = ...
}

new Entity("environmentvariablevalue")
{
  ["schemaname"] = ...,
  ["value"] = ...
}

Then it passes those as ComponentParameters.

Recommendation

For your custom API, accept the friendly PAC-style JSON, then transform it server-side into ComponentParameters before calling Dataverse. Do not send "EnvironmentVariables" or "ConnectionReferences" directly to ImportSolution; that is why people hit “invalid property” errors.

## MS Docs to read
https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolution?view=dataverse-latest
https://learn.microsoft.com/en-us/power-platform/alm/conn-ref-env-variables-build-tools
https://learn.microsoft.com/en-us/power-platform/alm/solution-async