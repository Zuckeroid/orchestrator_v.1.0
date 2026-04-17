<?php

declare(strict_types=1);

class Payment_Adapter_YooKassa implements FOSSBilling\InjectionAwareInterface
{
    protected ?Pimple\Container $di = null;

    public function __construct(private array $config)
    {
        foreach (['shop_id', 'secret_key'] as $key) {
            if (empty($this->config[$key])) {
                throw new Payment_Exception('The ":pay_gateway" payment gateway is not fully configured. Please configure the :missing', [
                    ':pay_gateway' => 'YooKassa',
                    ':missing' => $key,
                ], 4001);
            }
        }
    }

    public function setDi(Pimple\Container $di): void
    {
        $this->di = $di;
    }

    public function getDi(): ?Pimple\Container
    {
        return $this->di;
    }

    public static function getConfig(): array
    {
        return [
            'supports_one_time_payments' => true,
            'supports_subscriptions' => false,
            'description' => 'YooKassa payment gateway for FOSSBilling. It accepts invoice payments and sends signed lifecycle webhooks to Orchestrator after successful payment.',
            'form' => [
                'shop_id' => [
                    'text',
                    [
                        'label' => 'YooKassa shopId',
                    ],
                ],
                'secret_key' => [
                    'text',
                    [
                        'label' => 'YooKassa secret key',
                    ],
                ],
                'orchestrator_webhook_url' => [
                    'text',
                    [
                        'label' => 'Orchestrator webhook URL',
                        'placeholder' => 'https://orchestrator.example.com/api/v1/webhook/billing',
                        'required' => false,
                    ],
                ],
                'orchestrator_webhook_api_key' => [
                    'text',
                    [
                        'label' => 'Orchestrator webhook API key',
                        'required' => false,
                    ],
                ],
                'orchestrator_webhook_signing_secret' => [
                    'text',
                    [
                        'label' => 'Orchestrator webhook signing secret',
                        'required' => false,
                    ],
                ],
                'default_external_plan_id' => [
                    'text',
                    [
                        'label' => 'Default Orchestrator Billing plan ID',
                        'placeholder' => 'plan_basic',
                        'required' => false,
                    ],
                ],
                'product_plan_map_json' => [
                    'textarea',
                    [
                        'label' => 'Product ID to Orchestrator plan mapping JSON',
                        'placeholder' => '{"1":"plan_basic","2":"plan_premium"}',
                        'required' => false,
                    ],
                ],
                'auto_redirect' => [
                    'radio',
                    [
                        'label' => 'Auto redirect clients to YooKassa',
                        'multiOptions' => [
                            '1' => 'Yes',
                            '0' => 'No',
                        ],
                        'required' => false,
                    ],
                ],
            ],
        ];
    }

    public function getHtml(Api_Handler $api_admin, int $invoice_id, bool $subscription): string
    {
        if ($subscription) {
            throw new Payment_Exception('YooKassa subscriptions are not supported by this v1.0 gateway. Use recurring invoices in FOSSBilling and one-time YooKassa payments.');
        }

        $invoiceModel = $this->di['db']->getExistingModelById('Invoice', $invoice_id, 'Invoice not found');
        $invoiceService = $this->di['mod_service']('Invoice');
        $invoice = $invoiceService->toApiArray($invoiceModel, true);
        $payment = $this->createPayment($invoice);
        $confirmationUrl = $payment['confirmation']['confirmation_url'] ?? null;

        if (!$confirmationUrl) {
            throw new Payment_Exception('YooKassa did not return confirmation URL');
        }

        $button = '<a class="btn btn-primary" id="yookassa_payment_button" href="' . htmlspecialchars($confirmationUrl, ENT_QUOTES, 'UTF-8') . '">Pay with YooKassa</a>';
        if (!empty($this->config['auto_redirect'])) {
            return $button . '<script>document.addEventListener("DOMContentLoaded",function(){window.location.href=' . json_encode($confirmationUrl) . ';});</script>';
        }

        return $button;
    }

    public function processTransaction(Api_Handler $api_admin, int $id, array $data, int $gateway_id): void
    {
        $webhook = $this->parseWebhook($data);
        $paymentId = $this->resolvePaymentId($webhook, $data);
        $payment = $this->getPayment($paymentId);

        if (($payment['status'] ?? '') !== 'succeeded') {
            $this->markTransaction($id, [
                'txn_id' => $paymentId,
                'txn_status' => $payment['status'] ?? 'unknown',
                'status' => Model_Transaction::STATUS_RECEIVED,
            ]);

            return;
        }

        if ($this->hasProcessedPayment($paymentId, $gateway_id, $id)) {
            $this->markTransaction($id, [
                'txn_id' => $paymentId,
                'txn_status' => 'succeeded',
                'status' => Model_Transaction::STATUS_PROCESSED,
                'error' => '',
                'error_code' => null,
            ]);

            return;
        }

        $tx = $api_admin->invoice_transaction_get(['id' => $id]);
        if (($tx['status'] ?? null) === Model_Transaction::STATUS_PROCESSED && empty($tx['error'])) {
            return;
        }

        if (!$api_admin->invoice_transaction_claim_for_processing(['id' => $id])) {
            return;
        }

        $invoiceId = $this->resolveInvoiceId($payment, $webhook, $data, $tx);
        $invoice = $this->di['db']->getExistingModelById('Invoice', $invoiceId, 'Invoice not found');
        $invoiceService = $this->di['mod_service']('Invoice');
        $invoiceData = $invoiceService->toApiArray($invoice, true);

        $amount = (float) ($payment['amount']['value'] ?? $invoiceData['total']);
        $currency = strtoupper((string) ($payment['amount']['currency'] ?? $invoiceData['currency']));

        $api_admin->invoice_transaction_update([
            'id' => $id,
            'invoice_id' => $invoice->id,
            'txn_id' => $paymentId,
            'txn_status' => 'succeeded',
            'amount' => $amount,
            'currency' => $currency,
            'type' => Payment_Transaction::TXTYPE_PAYMENT,
        ]);

        $client = $this->di['db']->getExistingModelById('Client', $invoice->client_id, 'Client not found');
        $clientService = $this->di['mod_service']('Client');
        $clientService->addFunds($client, $amount, 'YooKassa payment ' . $paymentId, [
            'type' => 'YooKassa',
            'rel_id' => $paymentId,
        ]);

        if (!$invoice->approved) {
            $invoiceService->approveInvoice($invoice, ['use_credits' => false]);
        }
        $invoiceService->payInvoiceWithCredits($invoice);

        $api_admin->invoice_transaction_update([
            'id' => $id,
            'error' => '',
            'error_code' => null,
            'status' => Model_Transaction::STATUS_PROCESSED,
        ]);

        $freshInvoice = $this->di['db']->getExistingModelById('Invoice', $invoice->id, 'Invoice not found');
        $this->sendOrchestratorPaymentPaid($payment, $invoiceService->toApiArray($freshInvoice, true));
    }

    private function createPayment(array $invoice): array
    {
        $body = [
            'amount' => [
                'value' => $this->moneyFormat((float) $invoice['total']),
                'currency' => strtoupper((string) $invoice['currency']),
            ],
            'capture' => true,
            'confirmation' => [
                'type' => 'redirect',
                'return_url' => $this->config['return_url'],
            ],
            'description' => $this->buildPaymentDescription($invoice),
            'metadata' => [
                'invoice_id' => (string) $invoice['id'],
                'client_id' => (string) $invoice['client_id'],
                'external_subscription_id' => $this->resolveExternalSubscriptionId($invoice),
                'external_plan_id' => $this->resolveExternalPlanId($invoice),
                'email' => (string) ($invoice['buyer']['email'] ?? ''),
            ],
        ];

        return $this->requestYooKassa(
            'POST',
            '/v3/payments',
            $body,
            'fossbilling-invoice-' . $invoice['id'] . '-' . sha1(json_encode($body))
        );
    }

    private function getPayment(string $paymentId): array
    {
        return $this->requestYooKassa('GET', '/v3/payments/' . rawurlencode($paymentId));
    }

    private function requestYooKassa(string $method, string $path, ?array $body = null, ?string $idempotenceKey = null): array
    {
        $headers = [
            'Authorization' => 'Basic ' . base64_encode($this->config['shop_id'] . ':' . $this->config['secret_key']),
            'Accept' => 'application/json',
        ];
        if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
        }
        if ($idempotenceKey !== null) {
            $headers['Idempotence-Key'] = $idempotenceKey;
        }

        $client = Symfony\Component\HttpClient\HttpClient::create(['bindto' => BIND_TO]);
        $response = $client->request($method, 'https://api.yookassa.ru' . $path, [
            'headers' => $headers,
            'body' => $body === null ? null : json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'timeout' => 30,
        ]);

        $statusCode = $response->getStatusCode();
        $content = $response->getContent(false);
        $decoded = json_decode($content, true);
        if ($statusCode < 200 || $statusCode >= 300 || !is_array($decoded)) {
            throw new Payment_Exception('YooKassa API request failed: ' . $content);
        }

        return $decoded;
    }

    private function parseWebhook(array $data): array
    {
        $raw = $data['http_raw_post_data'] ?? '';
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        if (is_array($decoded)) {
            return $decoded;
        }

        return [
            'object' => $data['post'] ?? $data['get'] ?? [],
        ];
    }

    private function resolvePaymentId(array $webhook, array $data): string
    {
        $paymentId = $webhook['object']['id']
            ?? $data['post']['object']['id']
            ?? $data['post']['id']
            ?? $data['get']['payment_id']
            ?? $data['get']['id']
            ?? null;

        if (!is_string($paymentId) || $paymentId === '') {
            throw new Payment_Exception('YooKassa payment id was not found in callback');
        }

        return $paymentId;
    }

    private function resolveInvoiceId(array $payment, array $webhook, array $data, array $tx): int
    {
        $invoiceId = $tx['invoice_id']
            ?? $payment['metadata']['invoice_id']
            ?? $webhook['object']['metadata']['invoice_id']
            ?? $data['get']['invoice_id']
            ?? $data['post']['invoice_id']
            ?? null;

        if (!is_numeric($invoiceId)) {
            throw new Payment_Exception('Invoice id was not found in YooKassa payment metadata');
        }

        return (int) $invoiceId;
    }

    private function sendOrchestratorPaymentPaid(array $payment, array $invoice): void
    {
        if (empty($this->config['orchestrator_webhook_url'])) {
            return;
        }

        foreach (['orchestrator_webhook_api_key', 'orchestrator_webhook_signing_secret'] as $key) {
            if (empty($this->config[$key])) {
                throw new Payment_Exception('Orchestrator webhook is configured but ' . $key . ' is empty');
            }
        }

        $payload = [
            'event' => 'payment_paid',
            'eventId' => 'fossbilling_invoice_' . $invoice['id'] . '_payment_' . $payment['id'],
            'externalUserId' => 'client_' . $invoice['client_id'],
            'externalSubscriptionId' => $this->resolveExternalSubscriptionId($invoice),
            'externalOrderId' => 'invoice_' . $invoice['id'],
            'externalPaymentId' => (string) $payment['id'],
            'externalPlanId' => $this->resolveExternalPlanId($invoice),
            'email' => (string) ($invoice['buyer']['email'] ?? $invoice['client']['email'] ?? ''),
            'status' => 'paid',
        ];

        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $timestamp = (string) time();
        $signature = hash_hmac('sha256', $body, (string) $this->config['orchestrator_webhook_signing_secret']);

        $client = Symfony\Component\HttpClient\HttpClient::create(['bindto' => BIND_TO]);
        $response = $client->request('POST', (string) $this->config['orchestrator_webhook_url'], [
            'headers' => [
                'Content-Type' => 'application/json',
                'x-api-key' => (string) $this->config['orchestrator_webhook_api_key'],
                'x-timestamp' => $timestamp,
                'x-signature' => $signature,
            ],
            'body' => $body,
            'timeout' => 15,
        ]);

        $statusCode = $response->getStatusCode();
        if ($statusCode < 200 || $statusCode >= 300) {
            throw new Payment_Exception('Orchestrator webhook failed: ' . $response->getContent(false));
        }
    }

    private function resolveExternalSubscriptionId(array $invoice): string
    {
        foreach (($invoice['lines'] ?? []) as $line) {
            if (!empty($line['order_id'])) {
                return 'order_' . $line['order_id'];
            }
        }

        return 'invoice_' . $invoice['id'];
    }

    private function resolveExternalPlanId(array $invoice): string
    {
        $map = $this->parseProductPlanMap();
        foreach (($invoice['lines'] ?? []) as $line) {
            $orderId = (string) ($line['order_id'] ?? '');
            if ($orderId !== '' && isset($map['order:' . $orderId])) {
                return (string) $map['order:' . $orderId];
            }

            if ($orderId !== '') {
                $order = $this->di['db']->load('ClientOrder', (int) $orderId);
                $productId = $order instanceof Model_ClientOrder ? (string) $order->product_id : '';
                if ($productId !== '' && isset($map[$productId])) {
                    return (string) $map[$productId];
                }
            }
        }

        if (!empty($this->config['default_external_plan_id'])) {
            return (string) $this->config['default_external_plan_id'];
        }

        throw new Payment_Exception('Cannot resolve Orchestrator Billing plan ID. Configure default_external_plan_id or product_plan_map_json.');
    }

    private function parseProductPlanMap(): array
    {
        if (empty($this->config['product_plan_map_json'])) {
            return [];
        }

        $decoded = json_decode((string) $this->config['product_plan_map_json'], true);

        return is_array($decoded) ? $decoded : [];
    }

    private function buildPaymentDescription(array $invoice): string
    {
        $number = $invoice['serie_nr'] ?? $invoice['id'];

        return substr('Payment for invoice ' . $number, 0, 128);
    }

    private function moneyFormat(float $amount): string
    {
        return number_format($amount, 2, '.', '');
    }

    private function markTransaction(int $id, array $data): void
    {
        $data['id'] = $id;
        $this->di['api_system']->invoice_transaction_update($data);
    }

    private function hasProcessedPayment(string $paymentId, int $gatewayId, int $currentTransactionId): bool
    {
        $existing = $this->di['db']->findOne(
            'Transaction',
            'txn_id = ? AND gateway_id = ? AND id != ? AND status = ?',
            [$paymentId, $gatewayId, $currentTransactionId, Model_Transaction::STATUS_PROCESSED]
        );

        return $existing instanceof Model_Transaction;
    }
}
