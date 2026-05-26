# DPI Transport Inventory

## Goal

Inventory the current orchestrator before adding `TransportProfile`.

The direction is:

- orchestrator remains the control plane;
- `3x-ui` remains the execution provider;
- Android app reports probe results and consumes regenerated config;
- telemetry and admin UI must explain decisions instead of hiding them.

## Existing Backend Surface

### Node model

Current entity: `VpnNodeEntity` in `src/database/entities/vpn-node.entity.ts`.

What exists now:

- node identity: `id`, `name`, `country`, `vdsProvider`;
- panel access: `host`, `apiKey`, `apiVersion`;
- one configured `inboundId`;
- one `subscriptionBaseUrl`;
- node role: `usageScope` (`general`, `away`);
- health and load fields: `status`, `healthStatus`, `currentLoad`, `capacity`, `failureCount`, timestamps.

Important limitation:

- a node can represent only one inbound/profile today.

This is the first place where `TransportProfile` must extend the model.

### 3x-ui provider client

Current provider: `ThreeXuiVpnClient` in
`src/integrations/vpn/providers/three-x-ui-vpn.client.ts`.

What exists now:

- login/session handling;
- `checkNode()` checks one inbound by `node.inboundId`;
- `createClient()` adds a client into that inbound;
- `updateClient()` updates a client in that inbound;
- `deleteClient()` deletes a client from that inbound;
- subscription links are built from panel host or `subscriptionBaseUrl`.

Important limitation:

- no inbound inventory;
- no inbound create/update/delete;
- no profile-aware client creation;
- no explicit protocol/transport/SNI/port object.

For `TransportProfile`, this client needs provider methods for managing
inbounds and adding a user into a selected profile.

### Provision and device runtime

Current entities:

- `ProvisionEntity`;
- `DeviceConfigEntity`;
- `ProviderAccessEntity`.

What exists now:

- service-level provision is linked to one `vpnNodeId`;
- device config stores runtime payload, protocol, node id and revision;
- provider access stores provider user/login and metadata JSON;
- normal and away connection profiles already exist in runtime snapshots.

Important limitation:

- selected provider access has `nodeId`, but no `transportProfileId`;
- profile selection is effectively node-level, not inbound/profile-level.

This layer should receive `transportProfileId` and keep it in provider metadata.

### Runtime configurator

Current service:
`src/modules/configurator/configurator-runtime.service.ts`.

What exists now:

- resolves subscription links;
- parses `vless`, `vmess`, `trojan`;
- extracts stream settings such as TCP, WS, gRPC, HTTP/H2, TLS, Reality;
- builds full Xray JSON payload;
- builds `connectionProfiles` for app bundles.

Important strength:

- runtime parsing already understands most of the transport concepts we need.

Important limitation:

- parser is downstream of provider subscription output;
- orchestrator does not yet own the transport profile before 3x-ui creates it.

For `TransportProfile`, this service should consume profile metadata directly
when possible, while still being able to parse provider links as a sanity check.

### Telemetry

Current entities:

- `NetworkTelemetryEventEntity`;
- `NetworkTelemetryHourlyEntity`.

Current endpoints:

- `GET /telemetry/events`;
- `GET /telemetry/summary`;
- `GET /telemetry/overview`;
- `GET /telemetry/matrix`;
- `POST /telemetry/aggregate`;
- `POST /webhook/billing/telemetry`.

What exists now:

- raw event stream;
- hourly rollups;
- event type/result/classification;
- node, carrier, network type;
- `protocol` and `transport`;
- DPI monitor matrix in admin UI.

Important limitation:

- no `transportProfileId`;
- no SNI, TLS mode, Reality fingerprint, path, ALPN, flow as first-class
  telemetry dimensions;
- no automated decision engine yet.

For `TransportProfile`, telemetry should identify the exact tested profile, not
only protocol/transport strings.

## Existing Admin UI Surface

Current top-level tabs already include:

- Dashboard;
- Plans;
- VPN Nodes;
- Storage;
- Provisions;
- Subscription Configurator;
- App Routing;
- App Automation;
- DPI Monitor;
- Domains;
- Webhook;
- Events;
- Audit.

Important conclusion:

- do not add a second DPI dashboard;
- do not add a duplicate "Transport" root section at first.

Recommended placement:

- add transport profiles under `VPN Nodes`;
- show profile status inside `DPI Monitor`;
- show selected profile in `Subscription Configurator` service/device detail.

### VPN Nodes UI

Current form fields:

- name;
- country;
- VDS provider;
- host;
- 3x-ui username/password;
- inbound ID;
- provider subscription URL prefix;
- usage scope;
- capacity.

Current limitation:

- a node form edits one inbound id as a scalar field.

For `TransportProfile`, the node detail should have a nested profile table:

- profile name;
- protocol;
- transport;
- security;
- SNI/serverName;
- port;
- path/serviceName;
- 3x-ui inbound id;
- priority;
- status;
- last check.

### DPI Monitor UI

Current UI already shows:

- overview counters;
- top carriers/nodes/classifications;
- signal matrix by carrier, node, protocol and transport;
- recent raw events.

Current limitation:

- profile column is derived from protocol/transport only.

For `TransportProfile`, add:

- profile label/id;
- port/SNI/security summary;
- decision state (`ok`, `degraded`, `blocked_suspected`, `disabled`);
- action trail/reason.

## Proposed TransportProfile Shape

Initial entity: `TransportProfileEntity`.

Recommended fields:

- `id`;
- `nodeId`;
- `name`;
- `provider`;
- `providerInboundId`;
- `protocol`: `vless`, `vmess`, `trojan`, `shadowsocks`, `wireguard`;
- `transport`: `tcp`, `ws`, `grpc`, `h2`, `http`;
- `security`: `none`, `tls`, `reality`;
- `port`;
- `sni`;
- `hostHeader`;
- `path`;
- `serviceName`;
- `alpn`;
- `fingerprint`;
- `flow`;
- `publicKey`;
- `shortId`;
- `spiderX`;
- `priority`;
- `weight`;
- `status`: `draft`, `active`, `degraded`, `blocked`, `disabled`;
- `lastCheckAt`;
- `lastError`;
- `metadataJson`;
- timestamps.

Keep node-level `inboundId` temporarily as a default/legacy profile pointer.
Do not remove it in the first migration.

## Required API Additions

Backend:

- `GET /nodes/vpn/:nodeId/transport-profiles`;
- `POST /nodes/vpn/:nodeId/transport-profiles`;
- `PATCH /nodes/vpn/:nodeId/transport-profiles/:profileId`;
- `DELETE /nodes/vpn/:nodeId/transport-profiles/:profileId`;
- `POST /nodes/vpn/:nodeId/transport-profiles/:profileId/check`;
- later: `POST /nodes/vpn/:nodeId/transport-profiles/:profileId/sync-provider`.

Provider interface:

- list inbounds;
- create inbound from transport profile;
- update inbound from transport profile;
- check profile/inbound;
- create client in selected profile.

Telemetry:

- add `transportProfileId`;
- add optional SNI/security/port dimensions;
- keep raw diagnostic details privacy-safe.

Configurator:

- select profile before creating provider access;
- store `transportProfileId` in provider metadata;
- include profile summary in `connectionProfiles`.

Admin UI:

- nested transport profile management inside node detail;
- DPI matrix profile column becomes exact profile, not just protocol/transport.

## Implementation Order

1. Add inventory docs and keep the current system stable.
2. Add `TransportProfileEntity` and migration.
3. Extend backend node APIs with profile CRUD.
4. Extend admin UI under VPN Nodes.
5. Extend provider interface and 3x-ui client for inbound inventory/checking.
6. Add profile-aware client creation, while falling back to `node.inboundId`.
   Runtime auto-issue supports `vless`, `vmess`, `trojan`, `shadowsocks`.
   `wireguard` is inventoried and visible first, then promoted after provider
   client payloads are validated.
7. Add telemetry `transportProfileId` and profile columns in DPI Monitor.
8. Add policy engine decisions after enough telemetry exists.
9. Add Android probing for all active profiles returned by the orchestrator.

## Key Risks

- 3x-ui API shape can differ by version; provider methods must be defensive.
- Creating many inbounds can collide on ports/SNI, so validation is mandatory.
- DPI conclusions need repeated samples, not one failed probe.
- Telemetry can grow quickly; keep hourly rollups as the primary UI source.
- App auto-switching must be conservative to avoid reconnect loops.
