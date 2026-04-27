# Subscription Configurator v2

## Purpose

Turn the orchestrator from a relay of provider-specific subscription links into
the system component that owns device runtime configuration.

The orchestrator should:

- receive service/device events from billing;
- provision provider-side access when needed;
- normalize provider output into an app-ready runtime config;
- expose the current device config state in the admin UI;
- become the future control point for routing, automation, and telemetry-driven
  changes.

`3x-ui` remains an execution provider. It should not define the mobile app
contract.

## Direct migration rule

This project is still in development and has no real users yet. We will migrate
directly to v2 and will not keep a long-lived compatibility path around
`subscription_link`.

That means:

- the app should stop depending on raw provider subscription URLs;
- billing should stop treating `subscription_link` as the main result;
- the orchestrator should become the source of normalized runtime configs.

## System boundaries

### Billing / Appbridge

Billing owns:

- service entitlement;
- device limits;
- activation tokens;
- device tokens;
- device lifecycle in the client area.

Billing does **not** own VPN runtime config generation.

### Orchestrator

The orchestrator owns:

- device runtime config generation;
- provider access lifecycle;
- protocol and node selection;
- config revisioning;
- default routing/automation policy assignment;
- future telemetry-driven reconfiguration.

### Provider layer (`3x-ui`)

The provider owns:

- the actual remote access entry;
- provider credentials and technical access metadata.

The provider does **not** define the bundle contract for the mobile app.

## Core entities

### 1. `provision`

Represents the service-level subscription entitlement.

Suggested meaning going forward:

- one `provision` per active billing service/order;
- keeps plan-level and service-level state;
- no longer doubles as the final per-device runtime config.

Suggested responsibilities:

- external subscription identifiers;
- billing status mirror;
- plan binding;
- service expiry;
- aggregate status for the service.

### 2. `device_config`

Represents the current runtime configuration for a concrete device.

Suggested fields:

- `id`
- `provision_id`
- `device_id`
- `order_id`
- `client_id`
- `install_id`
- `status`
- `runtime_type`
- `runtime_payload`
- `protocol`
- `node_id`
- `config_revision`
- `routing_policy_json`
- `automation_policy_json`
- `telemetry_profile_json`
- `generated_at`
- `updated_at`

This entity becomes the main source of truth for what the app should run.

### 3. `provider_access`

Represents the remote access entry created in the provider layer.

Suggested fields:

- `id`
- `device_config_id`
- `provider`
- `provider_user_id`
- `provider_login`
- `provider_metadata_json`
- `status`
- `created_at`
- `updated_at`

Initially this will point to `3x-ui`, but it should stay provider-agnostic.

### 4. `policy_template`

Reusable defaults that can be applied to plans or devices.

Suggested fields:

- `id`
- `name`
- `type` (`routing`, `automation`, later maybe `protocol_profile`)
- `payload_json`
- `is_default`
- `created_at`
- `updated_at`

This keeps app defaults manageable and transparent in the admin UI.

## Lifecycle

### Service activation

1. Billing activates the order.
2. The orchestrator updates or creates the service-level `provision`.
3. No device runtime config has to exist yet.

### Device activation

1. The client app exchanges an activation token for a device token.
2. Billing creates or updates a device record and emits `device_activated`.
3. The orchestrator creates or updates `device_config`.
4. The orchestrator creates or updates `provider_access`.
5. The orchestrator generates the normalized runtime payload.
6. Billing exposes that payload through the Appbridge bundle.

### Device revoke

1. Billing marks the device revoked and emits `device_revoked`.
2. The orchestrator disables or removes the matching `provider_access`.
3. The orchestrator marks `device_config` inactive/revoked.
4. The app loses access on the next refresh.

### Plan/service change

1. Billing updates the service entitlement.
2. The orchestrator re-evaluates affected `device_config` rows.
3. A new `config_revision` is generated when runtime-relevant values change.

### Telemetry-driven change

1. The app sends telemetry through billing.
2. Billing forwards or stores telemetry for the orchestrator.
3. The orchestrator updates node/protocol/policy if needed.
4. A new `config_revision` is generated and exposed to the app.

## Runtime contract owned by the orchestrator

The orchestrator should produce normalized runtime material.

Initial target:

- `runtime_type = xray_config`
- `runtime_payload = full xray JSON`

Provider-specific raw formats such as `3x-ui` subscription URLs should stay
inside the orchestrator/provider boundary.

## Admin UI: new `Subscription Configurator` tab

The admin UI needs a dedicated tab so the system does not become a black box.

### Read-only first

The first version should show:

- service/provision list;
- devices under each service;
- current node;
- current protocol;
- current revision;
- provider state;
- generated-at timestamp.

### Detail view

The detail page for a device should show:

- the billing service/order;
- the device identity;
- provider access identifiers;
- runtime type;
- runtime payload preview;
- routing policy;
- automation policy;
- revision history.

### Later operator actions

Once the read-only view is stable, add:

- regenerate config;
- switch node;
- switch protocol;
- reset to policy defaults;
- disable device access.

## Default policy model

The configurator should support server-side defaults for:

- split-routing / app routing presets;
- auto-enable rules;
- auto-disable rules.

Recommended approach:

- the orchestrator sends defaults;
- the app stores local user overrides;
- the app merges local overrides over server defaults.

That keeps the backend authoritative for defaults without wiping device-local
user preference on each refresh.

## Explicit non-goals for v2 phase 1

Not required in the first implementation pass:

- full multi-provider support in the UI;
- per-app telemetry decisions;
- automatic node switching logic;
- historical analytics dashboards.

Phase 1 should focus on making the device runtime config explicit, inspectable,
and deliverable to billing/app in a normalized format.
