# Appbridge Bundle v2

## Goal

Define the app-facing bundle that billing returns after token exchange and
session refresh.

The mobile app should depend on this contract instead of provider-specific
`subscription_link` formats.

## Ownership

- Billing / Appbridge owns bundle delivery.
- The orchestrator owns normalized config generation.
- The provider layer does not define the app contract.

## Direct migration rule

This contract replaces link-based runtime delivery. We are not planning a
long-lived compatibility mode around raw provider subscription URLs.

The app should move to:

- `connection.runtime_type`
- `connection.payload`

and stop depending on:

- `subscription_link`
- raw provider subscription endpoints

## High-level shape

```json
{
  "contract_version": "appbridge-v2",
  "client": {
    "id": 12,
    "email": "user@example.com",
    "name": "User Name",
    "status": "active"
  },
  "device": {
    "id": 7,
    "order_id": 101,
    "name": "Redmi 13C",
    "platform": "android",
    "install_id": "android-install-id"
  },
  "access": {
    "has_active_access": true,
    "device_token": "DEVICE_TOKEN",
    "config_revision": "rev_2026_04_27_001"
  },
  "connection": {
    "ready": true,
    "runtime_type": "xray_config",
    "protocol": "vless",
    "node_id": "de-1",
    "node_label": "Germany 1",
    "payload": "{ ... xray json ... }"
  },
  "routing": {
    "mode": "split_tunnel",
    "default_enabled_apps": [
      "org.telegram.messenger",
      "org.thunderdog.challegram"
    ]
  },
  "automation": {
    "auto_enable_apps": [],
    "auto_disable_apps": [
      "com.google.android.youtube"
    ]
  },
  "service": {
    "order_id": 101,
    "title": "Znet PLUS",
    "expires_at": "2026-05-27T00:00:00+03:00",
    "days_remaining": 30
  },
  "generated_at": "2026-04-27T10:00:00+03:00"
}
```

## Field groups

### `contract_version`

String version for app/backend coordination.

Initial target:

- `appbridge-v2`

### `client`

Minimal client identity for app-side display and sanity checks.

Required fields:

- `id`
- `email`
- `name`
- `status`

### `device`

The concrete device this session belongs to.

Required fields:

- `id`
- `order_id`
- `name`
- `platform`
- `install_id`

The app should treat `device.id` as the stable runtime device identity.

### `access`

Session/access-level state.

Required fields:

- `has_active_access`
- `device_token`
- `config_revision`

Notes:

- the app keeps using `device_token` for refresh requests;
- `config_revision` lets the app detect that the runtime config changed.

### `connection`

Normalized runtime material for the VPN engine.

Required fields:

- `ready`
- `runtime_type`
- `payload`

Recommended fields:

- `protocol`
- `node_id`
- `node_label`

Initial supported runtime type:

- `xray_config`

The app should not need to understand raw provider subscription formats.

### `routing`

Default routing profile provided by the backend.

Suggested fields:

- `mode`
- `default_enabled_apps`
- `default_excluded_apps`

This is a defaults block, not the device-local final truth.

### `automation`

Default automation behavior.

Suggested fields:

- `auto_enable_apps`
- `auto_disable_apps`

This also represents defaults that the app may merge with local overrides.

### `service`

Service-level display metadata.

Required fields:

- `order_id`
- `title`
- `expires_at`
- `days_remaining`

## Merge model for app-side preferences

The orchestrator/billing should send **defaults** for routing and automation.

The app should then apply:

1. server defaults from the bundle;
2. local user overrides stored on the device.

This avoids wiping user tweaks while still allowing the backend to shape sane
starting behavior.

## Errors and readiness

The app should not interpret every failed bundle resolution as an invalid token.

The contract separates:

- token/session validity;
- service readiness;
- runtime availability.

Recommended error classes for later implementation:

- invalid device token;
- no active entitlement;
- device config not generated yet;
- runtime payload unavailable.

## Fields intentionally de-emphasized in v2

These may still exist temporarily during development, but they are no longer
the primary contract:

- `active_subscription_links`
- `subscription_link`
- provider-specific raw URLs

They should not be the main path for the app runtime.

## First implementation scope

For the first working v2 rollout:

- one active device config per device;
- one runtime type: `xray_config`;
- one primary node/protocol at a time;
- default routing/automation blocks;
- one `config_revision` value per device config snapshot.

This is enough to decouple the app from raw provider subscription links and to
let the orchestrator act as a real subscription configurator.
