# FOSSBilling YooKassa Gateway

This extension is a v1.0 skeleton for accepting invoice payments through YooKassa in FOSSBilling and notifying Orchestrator after a successful payment.

## Public Product Positioning

For YooKassa moderation and customer-facing pages, the service should be described as Storage:

- file storage;
- protected access to files;
- a device limit for protected file access;
- automatic activation after payment.

Do not mention VPN, 3x-ui, inbound, nodes, proxy, or tunneling on public billing pages. Those are internal infrastructure details and must stay inside Orchestrator/admin documentation.

## Boundary

YooKassa belongs to FOSSBilling. Orchestrator does not know about YooKassa and only receives signed billing lifecycle events from FOSSBilling.

```text
YooKassa
  -> FOSSBilling YooKassa gateway
  -> FOSSBilling invoice/order state
  -> signed Orchestrator webhook
  -> storage/protected-access provisioning
```

## Files

Copy this file into the FOSSBilling installation:

```text
src/library/Payment/Adapter/YooKassa/YooKassa.php
```

The target path on the server should become:

```text
<fossbilling-root>/src/library/Payment/Adapter/YooKassa/YooKassa.php
```

## FOSSBilling Setup

1. Copy the adapter file to the server.
2. Open FOSSBilling admin panel.
3. Go to payment gateways.
4. Install `YooKassa`.
5. Configure the gateway.
6. Enable one-time payments.
7. Keep subscriptions disabled for this v1.0 gateway.
8. Activate the local `Orchestrator` module in FOSSBilling and configure webhook/API keys there.

## Gateway Config

Required for YooKassa:

```text
shop_id
secret_key
```

Provisioning settings now live in the FOSSBilling `Orchestrator` module:

```text
orchestrator_webhook_url
orchestrator_webhook_api_key
orchestrator_webhook_signing_secret
billing_api_key
default_external_plan_id
product_plan_map_json
```

## YooKassa Webhook URL

Configure YooKassa to send payment webhooks to the FOSSBilling gateway callback URL shown in the FOSSBilling gateway settings. It will look like:

```text
https://billing.example.com/ipn.php?gateway_id=<gateway_id>
```

FOSSBilling receives the YooKassa webhook, verifies the payment by requesting YooKassa API with `shop_id` and `secret_key`, marks the invoice paid, activates or renews the order, and then the local `Orchestrator` module sends a signed lifecycle webhook to Orchestrator.

## Orchestrator Event

On successful payment, the gateway sends:

```json
{
  "event": "payment_paid",
  "eventId": "fossbilling_invoice_123_payment_2f9...",
  "externalUserId": "client_42",
  "externalSubscriptionId": "order_77",
  "externalOrderId": "invoice_123",
  "externalPaymentId": "2f9...",
  "externalPlanId": "plan_basic",
  "email": "client@example.com",
  "status": "paid"
}
```

The webhook is signed with HMAC SHA-256 over the raw JSON body and uses:

```text
x-api-key
x-timestamp
x-signature
```

## v1.0 Limitations

- YooKassa recurring payments are not implemented.
- FOSSBilling should generate recurring invoices; each invoice is paid as a one-time YooKassa payment.
- Refund handling is not implemented.
- Plan mapping must be configured manually through `default_external_plan_id` or `product_plan_map_json`.
