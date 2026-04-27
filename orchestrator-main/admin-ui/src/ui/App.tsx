import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ApiClient,
  AppPolicyApp,
  AuditLog,
  BillingWebhookEvent,
  BillingWebhookPayload,
  ConfiguratorProviderAccess,
  ConfiguratorPolicyTemplate,
  ConfiguratorServiceDetail,
  ConfiguratorServiceSummary,
  HealthData,
  PaginatedResult,
  Plan,
  ProcessedEvent,
  Provision,
  QueueOverview,
  StorageBackend,
  VpnNode,
  VpnNodeCheckResult,
} from '../api';

type TabId =
  | 'dashboard'
  | 'plans'
  | 'nodes'
  | 'storage'
  | 'provisions'
  | 'configurator'
  | 'app-routing'
  | 'app-automation'
  | 'webhook'
  | 'events'
  | 'audit';

interface PlanFormState {
  externalPlanId: string;
  billingProvider: string;
  name: string;
  maxDevices: string;
  storageSize: string;
  vpnEnabled: boolean;
  storageEnabled: boolean;
}

interface WebhookFormState {
  event: BillingWebhookEvent;
  eventId: string;
  externalUserId: string;
  externalSubscriptionId: string;
  externalOrderId: string;
  externalPaymentId: string;
  externalPlanId: string;
  email: string;
  status: string;
  expiresAt: string;
}

interface StorageBackendFormState {
  name: string;
  provider: string;
  endpoint: string;
  region: string;
  apiKey: string;
  secretKey: string;
  bucketPrefix: string;
  capacity: string;
}

interface VpnNodeFormState {
  name: string;
  country: string;
  vdsProvider: string;
  host: string;
  username: string;
  password: string;
  inboundId: string;
  subscriptionBaseUrl: string;
  capacity: string;
}

interface AppPolicyAppFormState {
  name: string;
  packageName: string;
  platform: string;
  category: string;
  iconUrl: string;
  notes: string;
  isActive: boolean;
}

interface RoutingProfileFormState {
  name: string;
  mode: string;
  includedApps: string;
  excludedApps: string;
  isDefault: boolean;
}

interface AutomationProfileFormState {
  name: string;
  autoConnectApps: string;
  autoDisconnectApps: string;
  isDefault: boolean;
}

interface ViewState {
  health?: HealthData;
  queue?: QueueOverview;
  plans: Plan[];
  nodes: VpnNode[];
  storageBackends: StorageBackend[];
  provisions: Provision[];
  events: ProcessedEvent[];
  auditLogs: AuditLog[];
  activeProvisionCount: number;
  failedEventCount: number;
}

const emptyViewState: ViewState = {
  plans: [],
  nodes: [],
  storageBackends: [],
  provisions: [],
  events: [],
  auditLogs: [],
  activeProvisionCount: 0,
  failedEventCount: 0,
};

const emptyPlanForm: PlanFormState = {
  externalPlanId: '',
  billingProvider: '',
  name: '',
  maxDevices: '',
  storageSize: '10737418240',
  vpnEnabled: true,
  storageEnabled: true,
};

const emptyStorageBackendForm: StorageBackendFormState = {
  name: '',
  provider: 'minio',
  endpoint: '',
  region: 'us-east-1',
  apiKey: '',
  secretKey: '',
  bucketPrefix: '',
  capacity: '100',
};

const emptyAppPolicyAppForm: AppPolicyAppFormState = {
  name: '',
  packageName: '',
  platform: 'android',
  category: '',
  iconUrl: '',
  notes: '',
  isActive: true,
};

const emptyRoutingProfileForm: RoutingProfileFormState = {
  name: 'Default selected apps',
  mode: 'selected_apps',
  includedApps: '',
  excludedApps: '',
  isDefault: true,
};

const emptyAutomationProfileForm: AutomationProfileFormState = {
  name: 'Default auto connect',
  autoConnectApps: '',
  autoDisconnectApps: '',
  isDefault: true,
};

const emptyNodeForm: VpnNodeFormState = {
  name: '',
  country: '',
  vdsProvider: '',
  host: '',
  username: '',
  password: '',
  inboundId: '1',
  subscriptionBaseUrl: '',
  capacity: '100',
};

const PROVISIONS_PAGE_SIZE = 10;
const CONFIGURATOR_PAGE_SIZE = 10;
const EVENTS_PAGE_SIZE = 10;
const AUDIT_PAGE_SIZE = 15;
const PROVISION_STATUSES = [
  'pending',
  'provisioning',
  'active',
  'failed',
  'suspended',
  'cancelled',
  'deleted',
];
const EVENT_STATUSES = ['received', 'queued', 'processing', 'completed', 'failed'];

const DEFAULT_API_SETTINGS = {
  apiBaseUrl: '/api/v1',
  adminApiKey: '',
  adminActor: 'admin',
};

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'orchestrator-admin-theme';

function createWebhookForm(): WebhookFormState {
  const suffix = Date.now();

  return {
    event: 'payment_paid',
    eventId: `evt_${suffix}`,
    externalUserId: `user_${suffix}`,
    externalSubscriptionId: `sub_${suffix}`,
    externalOrderId: `order_${suffix}`,
    externalPaymentId: `pay_${suffix}`,
    externalPlanId: '',
    email: `client-${suffix}@example.com`,
    status: 'paid',
    expiresAt: createLocalDateTimeValue(30),
  };
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [view, setView] = useState<ViewState>(emptyViewState);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookFormState>(() =>
    createWebhookForm(),
  );
  const [webhookResult, setWebhookResult] = useState('');
  const [nodeForm, setNodeForm] = useState<VpnNodeFormState>(emptyNodeForm);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [storageBackendForm, setStorageBackendForm] =
    useState<StorageBackendFormState>(emptyStorageBackendForm);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  const api = useMemo(() => new ApiClient(DEFAULT_API_SETTINGS), []);

  async function refreshAll() {
    setIsLoading(true);
    setError('');
    try {
      const [
        health,
        queue,
        plans,
        nodes,
        storageBackends,
        provisionsPage,
        activeProvisionsPage,
        eventsPage,
        failedEventsPage,
        auditLogs,
      ] = await Promise.all([
          api.get<HealthData>('/health'),
          api.get<QueueOverview>('/jobs/queue'),
          api.get<Plan[]>('/plans'),
          api.get<VpnNode[]>('/nodes/vpn'),
          api.get<StorageBackend[]>('/storage-backends'),
          api.get<PaginatedResult<Provision>>(
            `/provisions?page=1&limit=${PROVISIONS_PAGE_SIZE}`,
          ),
          api.get<PaginatedResult<Provision>>('/provisions?status=active&page=1&limit=1'),
          api.get<PaginatedResult<ProcessedEvent>>(
            `/processed-events?page=1&limit=${EVENTS_PAGE_SIZE}`,
          ),
          api.get<PaginatedResult<ProcessedEvent>>(
            '/processed-events?status=failed&page=1&limit=1',
          ),
          api.get<AuditLog[]>('/audit-logs?limit=50'),
        ]);

      setView({
        health,
        queue,
        plans,
        nodes,
        storageBackends,
        provisions: provisionsPage.items,
        events: eventsPage.items,
        auditLogs,
        activeProvisionCount: activeProvisionsPage.total,
        failedEventCount: failedEventsPage.total,
      });
      setRefreshVersion((current) => current + 1);
      setStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, [api]);

  useEffect(() => {
    if (webhookForm.externalPlanId || view.plans.length === 0) {
      return;
    }

    setWebhookForm((current) =>
      current.externalPlanId
        ? current
        : { ...current, externalPlanId: view.plans[0].externalPlanId },
    );
  }, [view.plans, webhookForm.externalPlanId]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    const payload = buildPlanPayload(planForm);

    await runAction(
      editingPlanId ? 'Plan mapping updated' : 'Plan mapping added',
      async () => {
        if (editingPlanId) {
          await api.patch(`/plans/${editingPlanId}`, payload);
        } else {
          await api.post('/plans', {
            externalPlanId: planForm.externalPlanId,
            ...payload,
          });
        }

        resetPlanForm();
      },
    );
  }

  function editPlan(plan: Plan) {
    setEditingPlanId(plan.id);
    setPlanForm({
      externalPlanId: plan.externalPlanId,
      billingProvider: plan.billingProvider ?? '',
      name: plan.name,
      maxDevices: plan.maxDevices === null || plan.maxDevices === undefined ? '' : String(plan.maxDevices),
      storageSize: plan.storageSize ?? '0',
      vpnEnabled: plan.vpnEnabled,
      storageEnabled: plan.storageEnabled,
    });
    setActiveTab('plans');
    setStatus(`Editing ${plan.name}`);
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
  }

  async function deletePlan(plan: Plan) {
    const confirmed = window.confirm(
      `Delete mapping "${plan.name}" for billing plan "${plan.externalPlanId}"?`,
    );
    if (!confirmed) {
      return;
    }

    await runAction('Plan mapping deleted', async () => {
      await api.delete(`/plans/${plan.id}`);
      if (editingPlanId === plan.id) {
        resetPlanForm();
      }
    });
  }

  async function sendWebhookTest(event: FormEvent) {
    event.preventDefault();
    await runAction('Webhook test sent', async () => {
      const result = await api.postBillingWebhook(buildWebhookPayload(webhookForm));
      setWebhookResult(
        result.duplicate
          ? 'Duplicate event accepted without queueing'
          : result.queued
            ? 'Event queued for processing'
            : 'Event accepted',
      );
    });
  }

  function regenerateWebhookIds() {
    const next = createWebhookForm();
    setWebhookForm((current) => ({
      ...current,
      eventId: next.eventId,
      externalUserId: next.externalUserId,
      externalSubscriptionId: next.externalSubscriptionId,
      externalOrderId: next.externalOrderId,
      externalPaymentId: next.externalPaymentId,
      email: next.email,
      expiresAt: next.expiresAt,
    }));
    setWebhookResult('');
  }

  async function saveNode(event: FormEvent) {
    event.preventDefault();
    const username = nodeForm.username.trim();
    const password = nodeForm.password.trim();

    if ((username || password) && (!username || !password)) {
      setError(
        'Enter both 3x-ui username and password, or leave both blank to keep current credentials',
      );
      return;
    }

    const payload = {
      name: nodeForm.name,
      country: optionalString(nodeForm.country) ?? null,
      vdsProvider: optionalString(nodeForm.vdsProvider) ?? null,
      host: nodeForm.host,
      apiVersion: '3x-ui',
      inboundId: Number(nodeForm.inboundId),
      subscriptionBaseUrl: optionalString(nodeForm.subscriptionBaseUrl) ?? null,
      capacity: Number(nodeForm.capacity),
      ...(username || password
        ? {
            apiKey: JSON.stringify({
              username,
              password,
            }),
          }
        : {}),
    };

    await runAction(
      editingNodeId ? 'VPN node updated' : 'VPN node created',
      async () => {
        if (editingNodeId) {
          await api.patch(`/nodes/vpn/${editingNodeId}`, payload);
        } else {
          await api.post('/nodes/vpn', payload);
        }
        resetNodeForm();
      },
    );
  }

  function editNode(node: VpnNode) {
    setEditingNodeId(node.id);
    setNodeForm({
      name: node.name ?? '',
      country: node.country ?? '',
      vdsProvider: node.vdsProvider ?? '',
      host: node.host,
      username: '',
      password: '',
      inboundId: String(node.inboundId ?? 1),
      subscriptionBaseUrl: node.subscriptionBaseUrl ?? '',
      capacity: String(node.capacity),
    });
    setActiveTab('nodes');
    setStatus(`Editing ${node.name ?? node.host}`);
  }

  function resetNodeForm() {
    setEditingNodeId(null);
    setNodeForm(emptyNodeForm);
  }

  async function disableNode(id: string) {
    await runAction('VPN node disabled', () => api.delete(`/nodes/vpn/${id}`));
  }

  async function deleteNode(id: string) {
    const confirmed = window.confirm(
      'Delete this VPN node permanently? This only works when no provisions are linked to the node.',
    );
    if (!confirmed) {
      return;
    }

    await runAction('VPN node deleted', async () => {
      await api.delete(`/nodes/vpn/${id}/purge`);
      if (editingNodeId === id) {
        resetNodeForm();
      }
    });
  }

  async function enableNode(id: string) {
    await runAction('VPN node enabled', () =>
      api.patch(`/nodes/vpn/${id}`, {
        isActive: true,
        status: 'active',
        lastError: null,
      }),
    );
  }

  async function checkNode(id: string) {
    setIsLoading(true);
    setError('');
    try {
      const result = await api.post<VpnNodeCheckResult>(`/nodes/vpn/${id}/check`);
      setStatus(
        `${result.message}${result.clientCount !== undefined ? `; clients: ${result.clientCount}` : ''}`,
      );
      await refreshAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await refreshAll();
    } finally {
      setIsLoading(false);
    }
  }

  async function createStorageBackend(event: FormEvent) {
    event.preventDefault();
    await runAction('Storage backend created', async () => {
      await api.post('/storage-backends', {
        name: optionalString(storageBackendForm.name),
        provider: storageBackendForm.provider,
        endpoint: storageBackendForm.endpoint,
        region: optionalString(storageBackendForm.region),
        apiKey: storageBackendForm.apiKey,
        secretKey: optionalString(storageBackendForm.secretKey),
        bucketPrefix: optionalString(storageBackendForm.bucketPrefix),
        capacity: Number(storageBackendForm.capacity),
      });
      setStorageBackendForm(emptyStorageBackendForm);
    });
  }

  async function disableStorageBackend(backend: StorageBackend) {
    const confirmed = window.confirm(
      `Disable storage backend "${backend.name ?? backend.endpoint}"?`,
    );
    if (!confirmed) {
      return;
    }

    await runAction('Storage backend disabled', () =>
      api.delete(`/storage-backends/${backend.id}`),
    );
  }

  async function deleteProvisionNow(id: string) {
    await runAction('Provision deleted', () =>
      api.post(`/provisions/${id}/delete-now`),
    );
  }

  async function retryProcessedEvent(id: string) {
    await runAction('Event queued for retry', () =>
      api.post(`/processed-events/${id}/retry`),
    );
  }

  async function purgeProcessedEvents(options: {
    status: 'completed' | 'failed' | 'all-terminal';
    olderThanDays: number;
  }) {
    const confirmed = window.confirm(
      `Delete ${options.status} events older than ${options.olderThanDays} days?`,
    );
    if (!confirmed) {
      return;
    }

    await runAction('Old events purged', () =>
      api.post('/processed-events/purge', options),
    );
  }

  async function purgeDeletedProvisions(options: { olderThanDays: number }) {
    const confirmed = window.confirm(
      `Delete deleted provisions older than ${options.olderThanDays} days?`,
    );
    if (!confirmed) {
      return;
    }

    await runAction('Deleted provisions purged', () =>
      api.post('/provisions/purge', options),
    );
  }

  async function runAction(message: string, action: () => Promise<unknown>) {
    setIsLoading(true);
    setError('');
    try {
      await action();
      setStatus(message);
      await refreshAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  const navItems: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'plans', label: 'Plan Mapping' },
    { id: 'nodes', label: 'VPN Nodes' },
    { id: 'storage', label: 'Storage Backends' },
    { id: 'provisions', label: 'Provisions' },
    { id: 'configurator', label: 'Configurator' },
    { id: 'app-routing', label: 'App Routing' },
    { id: 'app-automation', label: 'Auto On/Off' },
    { id: 'events', label: 'Events' },
    { id: 'webhook', label: 'Webhook Tester' },
    { id: 'audit', label: 'Audit' },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/orchestrator-mark.svg" alt="" />
          <div>
            <strong>Orchestrator</strong>
            <span>Admin</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activeTab === item.id ? 'active' : ''}
              onClick={() => setActiveTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="title-row">
              <h1>{navItems.find((item) => item.id === activeTab)?.label}</h1>
              <p>{status}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              onClick={() =>
                setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
              }
            >
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </button>
            <button className="primary" onClick={refreshAll} disabled={isLoading}>
              {isLoading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? <div className="error-line">{error}</div> : null}

        {activeTab === 'dashboard' ? (
          <Dashboard health={view.health} queue={view.queue} view={view} />
        ) : null}
        {activeTab === 'plans' ? (
          <PlanMappingPanel
            plans={view.plans}
            form={planForm}
            setForm={setPlanForm}
            editingPlanId={editingPlanId}
            onCreate={createPlan}
            onCancel={resetPlanForm}
            onEdit={editPlan}
            onDelete={deletePlan}
          />
        ) : null}
        {activeTab === 'nodes' ? (
          <NodesPanel
            nodes={view.nodes}
            form={nodeForm}
            setForm={setNodeForm}
            editingNodeId={editingNodeId}
            onSubmit={saveNode}
            onCancel={resetNodeForm}
            onEdit={editNode}
            onCheck={checkNode}
            onDisable={disableNode}
            onEnable={enableNode}
            onDelete={deleteNode}
          />
        ) : null}
        {activeTab === 'storage' ? (
          <StorageBackendsPanel
            backends={view.storageBackends}
            form={storageBackendForm}
            setForm={setStorageBackendForm}
            onCreate={createStorageBackend}
            onDisable={disableStorageBackend}
          />
        ) : null}
        {activeTab === 'provisions' ? (
          <ProvisionsPanel
            initialProvisions={view.provisions}
            refreshVersion={refreshVersion}
            onPurge={purgeDeletedProvisions}
            onDeleteNow={deleteProvisionNow}
          />
        ) : null}
        {activeTab === 'configurator' ? (
          <ConfiguratorPanel refreshVersion={refreshVersion} />
        ) : null}
        {activeTab === 'app-routing' ? (
          <AppPoliciesPanel mode="routing" refreshVersion={refreshVersion} />
        ) : null}
        {activeTab === 'app-automation' ? (
          <AppPoliciesPanel mode="automation" refreshVersion={refreshVersion} />
        ) : null}
        {activeTab === 'webhook' ? (
          <WebhookTesterPanel
            form={webhookForm}
            plans={view.plans}
            result={webhookResult}
            setForm={setWebhookForm}
            onRegenerate={regenerateWebhookIds}
            onSend={sendWebhookTest}
          />
        ) : null}
        {activeTab === 'events' ? (
          <EventsPanel
            initialEvents={view.events}
            queue={view.queue}
            refreshVersion={refreshVersion}
            onPurge={purgeProcessedEvents}
            onRetry={retryProcessedEvent}
          />
        ) : null}
        {activeTab === 'audit' ? <AuditPanel auditLogs={view.auditLogs} /> : null}
      </main>
    </div>
  );
}

function Dashboard({
  health,
  queue,
  view,
}: {
  health?: HealthData;
  queue?: QueueOverview;
  view: ViewState;
}) {
  const nodeHealth = groupCounts(
    view.nodes.map((item) => item.healthStatus || 'unknown'),
  );

  return (
    <>
      <section className="metric-grid">
        <Metric title="API" value={health?.status ?? 'unknown'} tone="green" />
        <Metric title="Database" value={health?.db ?? 'unknown'} tone="teal" />
        <Metric title="Redis" value={health?.redis ?? 'unknown'} tone="yellow" />
        <Metric
          title="Billing"
          value={health?.billing?.status ?? 'disabled'}
          tone={statusTone(health?.billing?.status)}
        />
        <Metric title="Nodes online" value={nodeHealth.online ?? 0} tone="green" />
        <Metric
          title="Nodes degraded"
          value={nodeHealth.degraded ?? 0}
          tone="yellow"
        />
        <Metric title="Nodes offline" value={nodeHealth.offline ?? 0} tone="red" />
        <Metric title="Nodes unknown" value={nodeHealth.unknown ?? 0} tone="teal" />
        <Metric
          title="Active provisions"
          value={view.activeProvisionCount}
          tone="green"
        />
        <Metric title="Failed events" value={view.failedEventCount} tone="red" />
        <Metric title="Queue delayed" value={queue?.counts.delayed ?? 0} tone="yellow" />
      </section>
      <section className="dashboard-top-grid">
        <NodeLoad nodes={view.nodes} />
        <SystemSummary health={health} />
      </section>
      <section className="dashboard-bottom-grid">
        <ProvisionSnapshot provisions={view.provisions} />
      </section>
    </>
  );
}

function Metric({
  title,
  value,
  tone,
}: {
  title: string;
  value: string | number;
  tone: string;
}) {
  return (
    <article className={`metric ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function NodeLoad({ nodes }: { nodes: VpnNode[] }) {
  return (
    <section className="panel">
      <h2>VPN Load</h2>
      {nodes.length === 0 ? <p>No VPN nodes yet.</p> : null}
      {nodes.map((node) => {
        const percent = Math.round((node.currentLoad / node.capacity) * 100);
        return (
          <div className="load-row" key={node.id}>
            <div className="load-node">
              <strong className="node-label">
                {renderCountryFlag(node.country)}
                <span>{node.name ?? node.host}</span>
              </strong>
              <span className={`status-pill ${healthTone(node.healthStatus)}`}>
                {node.healthStatus}
              </span>
            </div>
            <div className="load-meter">
              <div className="bar">
                <span style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
              <span className="load-count">
                {node.currentLoad}/{node.capacity}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ProvisionSnapshot({ provisions }: { provisions: Provision[] }) {
  const statuses = groupCounts(provisions.map((item) => item.status));
  return (
    <section className="panel">
      <h2>Provision Status</h2>
      <div className="pill-row">
        {Object.entries(statuses).map(([status, count]) => (
          <span className="pill" key={status}>
            {status}: {count}
          </span>
        ))}
      </div>
    </section>
  );
}

function SystemSummary({ health }: { health?: HealthData }) {
  const runtime = health?.runtime;

  return (
    <section className="panel">
      <h2>System</h2>
      {!runtime ? <p>No runtime settings available.</p> : null}
      {runtime ? (
        <dl className="detail-list">
          <dt>Mode</dt>
          <dd>{runtime.mode}</dd>
          <dt>Node env</dt>
          <dd>{runtime.nodeEnv}</dd>
          <dt>Billing provider</dt>
          <dd>{runtime.billingProvider}</dd>
          <dt>VPN provider</dt>
          <dd>{runtime.vpnProvider}</dd>
          <dt>Health checks</dt>
          <dd>
            {runtime.nodeHealthChecks.enabled
              ? `enabled, ${humanizeCron(runtime.nodeHealthChecks.cron)}`
              : 'disabled'}
          </dd>
          <dt>Cleanup</dt>
          <dd>
            {runtime.cleanup.enabled
              ? `enabled, ${humanizeCron(runtime.cleanup.cron)}, limit ${runtime.cleanup.limit}`
              : 'disabled'}
          </dd>
          <dt>Webhook limit</dt>
          <dd>{formatRateLimit(runtime.rateLimits.webhook)}</dd>
          <dt>Admin API limit</dt>
          <dd>{formatRateLimit(runtime.rateLimits.adminApi)}</dd>
        </dl>
      ) : null}
    </section>
  );
}

function PlanMappingPanel({
  plans,
  form,
  setForm,
  editingPlanId,
  onCreate,
  onCancel,
  onEdit,
  onDelete,
}: {
  plans: Plan[];
  form: PlanFormState;
  setForm: (form: PlanFormState) => void;
  editingPlanId: string | null;
  onCreate: (event: FormEvent) => void;
  onCancel: () => void;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}) {
  return (
    <section className="split-layout">
      <form className="panel form-panel" onSubmit={onCreate}>
        <h2>{editingPlanId ? 'Edit Mapping' : 'Add Mapping'}</h2>
        <label>
          Billing plan ID
          <input
            required
            disabled={editingPlanId !== null}
            value={form.externalPlanId}
            onChange={(event) =>
              setForm({ ...form, externalPlanId: event.target.value })
            }
          />
        </label>
        <label>
          Billing provider
          <input
            placeholder="fossbilling"
            value={form.billingProvider}
            onChange={(event) =>
              setForm({ ...form, billingProvider: event.target.value })
            }
          />
        </label>
        <label>
          Mapping name
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Observed billing device limit
          <input
            type="number"
            min="0"
            value={form.maxDevices}
            readOnly
          />
        </label>
        <small>
          Filled automatically from billing webhook payload. The billing tariff is
          the source of truth for device slots.
        </small>
        <label>
          Storage bytes
          <input
            required
            value={form.storageSize}
            onChange={(event) =>
              setForm({ ...form, storageSize: event.target.value })
            }
          />
        </label>
        <div className="toggle-grid">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.vpnEnabled}
              onChange={(event) =>
                setForm({ ...form, vpnEnabled: event.target.checked })
              }
            />
            VPN enabled
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.storageEnabled}
              onChange={(event) =>
                setForm({ ...form, storageEnabled: event.target.checked })
              }
            />
            Storage enabled
          </label>
        </div>
        <div className="form-actions">
          <button className="primary" type="submit">
            {editingPlanId ? 'Save mapping' : 'Add mapping'}
          </button>
          {editingPlanId ? (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      <section className="panel table-panel">
        <h2>Plan Mapping</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mapping</th>
                <th>Billing plan ID</th>
                <th>Provider</th>
                <th>Observed device limit</th>
                <th>Storage bytes</th>
                <th>VPN</th>
                <th>Storage</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.name}</td>
                  <td>{plan.externalPlanId}</td>
                  <td>{plan.billingProvider ?? 'default'}</td>
                  <td>{plan.maxDevices ?? 'none'}</td>
                  <td>{plan.storageSize ?? 'none'}</td>
                  <td>{plan.vpnEnabled ? 'on' : 'off'}</td>
                  <td>{plan.storageEnabled ? 'on' : 'off'}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => onEdit(plan)} type="button">
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() => onDelete(plan)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function NodesPanel({
  nodes,
  form,
  setForm,
  editingNodeId,
  onSubmit,
  onCancel,
  onEdit,
  onCheck,
  onDisable,
  onEnable,
  onDelete,
}: {
  nodes: VpnNode[];
  form: VpnNodeFormState;
  setForm: (form: VpnNodeFormState) => void;
  editingNodeId: string | null;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onEdit: (node: VpnNode) => void;
  onCheck: (id: string) => void;
  onDisable: (id: string) => void;
  onEnable: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isEditing = editingNodeId !== null;

  return (
    <section className="split-layout">
      <form className="panel form-panel" onSubmit={onSubmit}>
        <h2>{isEditing ? 'Edit VPN Node' : 'Add VPN Node'}</h2>
        <label>
          Name
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Country
          <input
            placeholder="Netherlands / NL"
            value={form.country}
            onChange={(event) =>
              setForm({ ...form, country: event.target.value })
            }
          />
        </label>
        <label>
          VDS provider
          <input
            placeholder="Aeza / Timeweb / Selectel"
            value={form.vdsProvider}
            onChange={(event) =>
              setForm({ ...form, vdsProvider: event.target.value })
            }
          />
        </label>
        <label>
          Host
          <input
            required
            value={form.host}
            onChange={(event) => setForm({ ...form, host: event.target.value })}
          />
        </label>
        <label>
          3x-ui username
          <input
            required={!isEditing}
            placeholder={isEditing ? 'Leave blank to keep current' : 'admin'}
            value={form.username}
            onChange={(event) =>
              setForm({ ...form, username: event.target.value })
            }
          />
        </label>
        <label>
          3x-ui password
          <input
            required={!isEditing}
            type="password"
            placeholder={isEditing ? 'Leave blank to keep current' : 'secret'}
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
          />
        </label>
        <label>
          Inbound ID
          <input
            required
            type="number"
            min="0"
            value={form.inboundId}
            onChange={(event) =>
              setForm({ ...form, inboundId: event.target.value })
            }
          />
        </label>
        <label>
          Provider subscription URL prefix
          <input
            placeholder="https://109.120.140.251:2096/sub_9fK3xL8pQ2mZ7rT"
            value={form.subscriptionBaseUrl}
            onChange={(event) =>
              setForm({ ...form, subscriptionBaseUrl: event.target.value })
            }
          />
        </label>
        <label>
          Capacity
          <input
            required
            type="number"
            min="1"
            value={form.capacity}
            onChange={(event) =>
              setForm({ ...form, capacity: event.target.value })
            }
          />
        </label>
        <div className="form-actions">
          <button className="primary" type="submit">
            {isEditing ? 'Save node' : 'Add node'}
          </button>
          {isEditing ? (
            <>
              <button className="danger" type="button" onClick={() => onDelete(editingNodeId!)}>
                Delete node
              </button>
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </form>
      <section className="panel table-panel">
        <h2>VPN Nodes</h2>
        <div className="table-wrap">
          <table className="nodes-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>VDS Provider</th>
                <th>Host</th>
                <th>Role</th>
                <th>Health</th>
                <th>Load</th>
                <th>Inbound</th>
                <th>Checked</th>
                <th>Last error</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id}>
                  <td>
                    <span className="node-label">
                      {renderCountryFlag(node.country)}
                      <span>{node.name ?? 'unnamed'}</span>
                    </span>
                  </td>
                  <td>{renderProviderLink(node.vdsProvider)}</td>
                  <td>
                    <a href={node.host} target="_blank" rel="noreferrer">
                      {node.host}
                    </a>
                    {node.subscriptionBaseUrl ? (
                      <span className="cell-note">{node.subscriptionBaseUrl}</span>
                    ) : null}
                  </td>
                  <td>{node.status}</td>
                  <td>
                    <span
                      className={`status-pill ${healthTone(node.healthStatus)}`}
                    >
                      {node.healthStatus}
                    </span>
                    {node.failureCount > 0 ? (
                      <span className="cell-note">fails: {node.failureCount}</span>
                    ) : null}
                  </td>
                  <td>
                    {node.currentLoad}/{node.capacity}
                  </td>
                  <td>{node.inboundId ?? 'none'}</td>
                  <td>
                    {formatDate(node.lastHealthCheckAt)}
                    {node.lastSuccessfulHealthCheckAt ? (
                      <span className="cell-note">
                        last ok: {formatDate(node.lastSuccessfulHealthCheckAt)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {node.lastError ? (
                      <span className="error-text">{node.lastError}</span>
                    ) : (
                      <span className="muted">none</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions node-actions">
                      <button onClick={() => onEdit(node)} type="button">
                        Edit
                      </button>
                      {node.isActive ? (
                        <button onClick={() => onDisable(node.id)} type="button">
                          Disable
                        </button>
                      ) : (
                        <button
                          className="primary"
                          onClick={() => onEnable(node.id)}
                          type="button"
                        >
                          Enable
                        </button>
                      )}
                      <button
                        className="node-check-action"
                        onClick={() => onCheck(node.id)}
                        type="button"
                      >
                        Check now
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function StorageBackendsPanel({
  backends,
  form,
  setForm,
  onCreate,
  onDisable,
}: {
  backends: StorageBackend[];
  form: StorageBackendFormState;
  setForm: (form: StorageBackendFormState) => void;
  onCreate: (event: FormEvent) => void;
  onDisable: (backend: StorageBackend) => void;
}) {
  return (
    <section className="split-layout">
      <form className="panel form-panel" onSubmit={onCreate}>
        <h2>Add Storage Backend</h2>
        <label>
          Name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Provider
          <select
            value={form.provider}
            onChange={(event) =>
              setForm({ ...form, provider: event.target.value })
            }
          >
            <option value="minio">minio</option>
            <option value="s3">s3</option>
          </select>
        </label>
        <label>
          Endpoint
          <input
            required
            placeholder="http://localhost:9000"
            value={form.endpoint}
            onChange={(event) =>
              setForm({ ...form, endpoint: event.target.value })
            }
          />
        </label>
        <label>
          Region
          <input
            value={form.region}
            onChange={(event) => setForm({ ...form, region: event.target.value })}
          />
        </label>
        <label>
          Access key
          <input
            required
            value={form.apiKey}
            onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
          />
        </label>
        <label>
          Secret key
          <input
            type="password"
            value={form.secretKey}
            onChange={(event) =>
              setForm({ ...form, secretKey: event.target.value })
            }
          />
        </label>
        <label>
          Bucket prefix
          <input
            value={form.bucketPrefix}
            onChange={(event) =>
              setForm({ ...form, bucketPrefix: event.target.value })
            }
          />
        </label>
        <label>
          Capacity
          <input
            required
            type="number"
            min="1"
            value={form.capacity}
            onChange={(event) =>
              setForm({ ...form, capacity: event.target.value })
            }
          />
        </label>
        <button className="primary" type="submit">
          Add backend
        </button>
      </form>
      <section className="panel table-panel">
        <h2>Storage Backends</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider</th>
                <th>Endpoint</th>
                <th>Region</th>
                <th>Load</th>
                <th>Active</th>
                <th>Prefix</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {backends.map((backend) => (
                <tr key={backend.id}>
                  <td>{backend.name ?? 'unnamed'}</td>
                  <td>{backend.provider}</td>
                  <td>{backend.endpoint}</td>
                  <td>{backend.region ?? 'none'}</td>
                  <td>
                    {backend.currentLoad}/{backend.capacity}
                  </td>
                  <td>{backend.isActive ? 'yes' : 'no'}</td>
                  <td>{backend.bucketPrefix ?? 'none'}</td>
                  <td>
                    <button
                      disabled={!backend.isActive}
                      onClick={() => onDisable(backend)}
                      type="button"
                    >
                      Disable
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ProvisionsPanel({
  initialProvisions,
  refreshVersion,
  onPurge,
  onDeleteNow,
}: {
  initialProvisions: Provision[];
  refreshVersion: number;
  onPurge: (options: { olderThanDays: number }) => void;
  onDeleteNow: (id: string) => void;
}) {
  const api = useMemo(() => new ApiClient(DEFAULT_API_SETTINGS), []);
  const [provisions, setProvisions] = useState<Provision[]>(initialProvisions);
  const [totalItems, setTotalItems] = useState(initialProvisions.length);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedProvisionId, setSelectedProvisionId] = useState<string | null>(null);
  const [selectedProvision, setSelectedProvision] = useState<Provision | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [purgeDays, setPurgeDays] = useState('30');
  const totalPages = Math.max(Math.ceil(totalItems / PROVISIONS_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setListLoading(true);
      setListError('');
      try {
        const query = new URLSearchParams({
          page: String(currentPage),
          limit: String(PROVISIONS_PAGE_SIZE),
        });

        if (statusFilter !== 'all') {
          query.set('status', statusFilter);
        }

        const response = await api.get<PaginatedResult<Provision>>(
          `/provisions?${query.toString()}`,
        );

        if (cancelled) {
          return;
        }

        const nextTotalPages = Math.max(
          Math.ceil(response.total / PROVISIONS_PAGE_SIZE),
          1,
        );

        if (response.items.length === 0 && response.total > 0 && currentPage > nextTotalPages) {
          setPage(nextTotalPages);
          return;
        }

        setProvisions(response.items);
        setTotalItems(response.total);
      } catch (caught) {
        if (!cancelled) {
          setListError(caught instanceof Error ? caught.message : String(caught));
          setProvisions([]);
          setTotalItems(0);
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [api, currentPage, refreshVersion, statusFilter]);

  useEffect(() => {
    if (provisions.length === 0) {
      setSelectedProvisionId(null);
      setSelectedProvision(null);
      setDetailsError('');
      return;
    }

    const existing = provisions.find(
      (provision) => provision.id === selectedProvisionId,
    );
    if (!existing) {
      setSelectedProvisionId(provisions[0].id);
    }
  }, [provisions, selectedProvisionId]);

  useEffect(() => {
    if (!selectedProvisionId) {
      return;
    }

    let cancelled = false;

    async function loadDetails() {
      setDetailsLoading(true);
      setDetailsError('');
      try {
        const details = await api.get<Provision>(`/provisions/${selectedProvisionId}`);
        if (!cancelled) {
          setSelectedProvision(details);
        }
      } catch (caught) {
        if (!cancelled) {
          setSelectedProvision(null);
          setDetailsError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [api, refreshVersion, selectedProvisionId]);

  function handlePurge() {
    const olderThanDays = Number(purgeDays);
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      return;
    }

    onPurge({
      olderThanDays,
    });
  }

  return (
    <>
      <section className="provisions-layout">
        <section className="panel provision-details-panel">
          <div className="panel-heading">
            <h2>Provision Details</h2>
            {selectedProvision ? (
              <span className={`status-pill ${statusTone(selectedProvision.status)}`}>
                {selectedProvision.status}
              </span>
            ) : null}
          </div>
          {detailsLoading ? <p>Loading provision details...</p> : null}
          {detailsError ? <div className="error-line">{detailsError}</div> : null}
          {!detailsLoading && !detailsError && !selectedProvision ? (
            <p className="muted">Select a provision to inspect details.</p>
          ) : null}
          {!detailsLoading && !detailsError && selectedProvision ? (
            <div className="detail-grid">
              <div className="detail-block">
                <h3>Meta</h3>
                <dl className="detail-list">
                  <dt>User</dt>
                  <dd>{selectedProvision.email}</dd>
                  <dt>User ID</dt>
                  <dd>{selectedProvision.externalUserId}</dd>
                  <dt>Subscription</dt>
                  <dd>{selectedProvision.externalSubscriptionId}</dd>
                  <dt>VPN node</dt>
                  <dd>{selectedProvision.vpnNodeId ?? 'none'}</dd>
                  <dt>VPN login</dt>
                  <dd>{selectedProvision.vpnLogin ?? 'none'}</dd>
                  <dt>Storage</dt>
                  <dd>{selectedProvision.storageStatus}</dd>
                  <dt>Days left</dt>
                  <dd>{formatDaysLeft(selectedProvision.serviceExpiresAt)}</dd>
                  <dt>Delete after</dt>
                  <dd>{formatDate(selectedProvision.deleteAfter)}</dd>
                  <dt>Created</dt>
                  <dd>{formatDate(selectedProvision.createdAt)}</dd>
                  <dt>Updated</dt>
                  <dd>{formatDate(selectedProvision.updatedAt)}</dd>
                </dl>
              </div>
              <div className="detail-block">
                <h3>Provider Diagnostics</h3>
                <dl className="detail-list">
                  <dt>Provider URL</dt>
                  <dd>
                    {selectedProvision.subscriptionLink ? (
                      <>
                        <a
                          href={selectedProvision.subscriptionLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {selectedProvision.subscriptionLink}
                        </a>
                        <span className="cell-note">
                          Diagnostic only. Apps use generated runtime payload.
                        </span>
                      </>
                    ) : (
                      'none'
                    )}
                  </dd>
                  <dt>Error</dt>
                  <dd>{selectedProvision.error ?? 'none'}</dd>
                  <dt>Deleted at</dt>
                  <dd>{formatDate(selectedProvision.deletedAt)}</dd>
                </dl>
                <div className="row-actions detail-actions">
                  {selectedProvision.subscriptionLink ? (
                    <button
                      onClick={() =>
                        window.open(selectedProvision.subscriptionLink!, '_blank', 'noopener,noreferrer')
                      }
                      type="button"
                    >
                      Open provider link
                    </button>
                  ) : null}
                  <button
                    disabled={selectedProvision.status === 'deleted'}
                    onClick={() => onDeleteNow(selectedProvision.id)}
                    type="button"
                  >
                    Delete now
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
        <section className="panel table-panel">
          <div className="panel-heading">
            <h2>Provisions</h2>
            <div className="row-actions filter-toolbar">
              <label className="inline-filter">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {PROVISION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-filter">
                Purge deleted older than
                <input
                  min="1"
                  step="1"
                  type="number"
                  value={purgeDays}
                  onChange={(event) => setPurgeDays(event.target.value)}
                />
                <span>days</span>
              </label>
              <button type="button" onClick={handlePurge}>
                Purge
              </button>
            </div>
          </div>
          {listLoading ? <p>Loading provisions...</p> : null}
          {listError ? <div className="error-line">{listError}</div> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Subscription</th>
                  <th>Storage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {provisions.map((provision) => (
                  <tr
                    key={provision.id}
                    className={
                      provision.id === selectedProvisionId ? 'event-row active' : 'event-row'
                    }
                    onClick={() => setSelectedProvisionId(provision.id)}
                  >
                    <td>{provision.email}</td>
                    <td>{provision.externalSubscriptionId}</td>
                    <td>{provision.storageStatus}</td>
                    <td>
                      <span className={`status-pill ${statusTone(provision.status)}`}>
                        {provision.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={PROVISIONS_PAGE_SIZE}
            onPageChange={setPage}
          />
        </section>
      </section>
    </>
  );
}

function ConfiguratorPanel({ refreshVersion }: { refreshVersion: number }) {
  const api = useMemo(() => new ApiClient(DEFAULT_API_SETTINGS), []);
  const [services, setServices] = useState<ConfiguratorServiceSummary[]>([]);
  const [policyTemplates, setPolicyTemplates] = useState<
    ConfiguratorPolicyTemplate[]
  >([]);
  const [totalItems, setTotalItems] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedService, setSelectedService] =
    useState<ConfiguratorServiceDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const totalPages = Math.max(Math.ceil(totalItems / CONFIGURATOR_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      setListLoading(true);
      setListError('');
      try {
        const query = new URLSearchParams({
          page: String(currentPage),
          limit: String(CONFIGURATOR_PAGE_SIZE),
        });

        if (statusFilter !== 'all') {
          query.set('status', statusFilter);
        }

        const response = await api.get<PaginatedResult<ConfiguratorServiceSummary>>(
          `/configurator/services?${query.toString()}`,
        );

        if (cancelled) {
          return;
        }

        const nextTotalPages = Math.max(
          Math.ceil(response.total / CONFIGURATOR_PAGE_SIZE),
          1,
        );
        if (
          response.items.length === 0 &&
          response.total > 0 &&
          currentPage > nextTotalPages
        ) {
          setPage(nextTotalPages);
          return;
        }

        setServices(response.items);
        setTotalItems(response.total);
      } catch (caught) {
        if (!cancelled) {
          setListError(caught instanceof Error ? caught.message : String(caught));
          setServices([]);
          setTotalItems(0);
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadServices();

    return () => {
      cancelled = true;
    };
  }, [api, currentPage, refreshVersion, reloadVersion, statusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadPolicyTemplates() {
      setTemplatesLoading(true);
      setTemplatesError('');
      try {
        const response = await api.get<ConfiguratorPolicyTemplate[]>(
          '/configurator/policy-templates',
        );
        if (!cancelled) {
          setPolicyTemplates(response);
        }
      } catch (caught) {
        if (!cancelled) {
          setTemplatesError(
            caught instanceof Error ? caught.message : String(caught),
          );
          setPolicyTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    }

    void loadPolicyTemplates();

    return () => {
      cancelled = true;
    };
  }, [api, refreshVersion]);

  useEffect(() => {
    if (services.length === 0) {
      setSelectedServiceId(null);
      setSelectedService(null);
      setDetailsError('');
      return;
    }

    const existing = services.find((service) => service.id === selectedServiceId);
    if (!existing) {
      setSelectedServiceId(services[0].id);
    }
  }, [services, selectedServiceId]);

  useEffect(() => {
    setActionMessage('');
    setActionError('');
  }, [selectedServiceId]);

  useEffect(() => {
    if (!selectedServiceId) {
      return;
    }

    let cancelled = false;

    async function loadDetails() {
      setDetailsLoading(true);
      setDetailsError('');
      try {
        const details = await api.get<ConfiguratorServiceDetail>(
          `/configurator/services/${selectedServiceId}`,
        );
        if (!cancelled) {
          setSelectedService(details);
        }
      } catch (caught) {
        if (!cancelled) {
          setSelectedService(null);
          setDetailsError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [api, refreshVersion, reloadVersion, selectedServiceId]);

  async function handleRegenerateConfig() {
    if (!selectedServiceId) {
      return;
    }

    setRegenerateLoading(true);
    setActionMessage('');
    setActionError('');

    try {
      const details = await api.post<ConfiguratorServiceDetail>(
        `/configurator/services/${selectedServiceId}/regenerate`,
      );
      setSelectedService(details);
      setActionMessage('Config regenerated');
      setReloadVersion((value) => value + 1);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRegenerateLoading(false);
    }
  }

  return (
    <section className="provisions-layout">
      <div className="events-sidebar">
        <section className="panel event-details-panel">
          <div className="panel-heading">
            <h2>Service Config</h2>
            <div className="row-actions">
              {selectedService ? (
                <span className={`status-pill ${statusTone(selectedService.status)}`}>
                  {selectedService.status}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleRegenerateConfig()}
                disabled={!selectedServiceId || detailsLoading || regenerateLoading}
              >
                {regenerateLoading ? 'Regenerating...' : 'Regenerate config'}
              </button>
            </div>
          </div>
          {detailsLoading ? <p>Loading configurator details...</p> : null}
          {detailsError ? <div className="error-line">{detailsError}</div> : null}
          {actionError ? <div className="error-line">{actionError}</div> : null}
          {actionMessage ? <div className="success-line">{actionMessage}</div> : null}
          {!detailsLoading && !detailsError && !selectedService ? (
            <p className="muted">
              Select a service to inspect the future device runtime model.
            </p>
          ) : null}
          {!detailsLoading && !detailsError && selectedService ? (
            <div className="configurator-stack">
              <div className="detail-block">
                <h3>Service master</h3>
                <dl className="detail-list compact">
                  <dt>Subscription</dt>
                  <dd>{selectedService.externalSubscriptionId}</dd>
                  <dt>User</dt>
                  <dd>{selectedService.email}</dd>
                  <dt>External user</dt>
                  <dd>{selectedService.externalUserId}</dd>
                  <dt>Order</dt>
                  <dd>{selectedService.externalOrderId ?? 'none'}</dd>
                  <dt>Plan</dt>
                  <dd>
                    {selectedService.plan
                      ? `${selectedService.plan.name} (${selectedService.plan.externalPlanId})`
                      : 'none'}
                  </dd>
                  <dt>Expires</dt>
                  <dd>{formatDate(selectedService.serviceExpiresAt)}</dd>
                  <dt>Days left</dt>
                  <dd>{formatDaysLeft(selectedService.serviceExpiresAt)}</dd>
                  <dt>Node</dt>
                  <dd>
                    {selectedService.vpnNode ? (
                      <span className="node-label">
                        {renderCountryFlag(selectedService.vpnNode.country)}
                        <span>
                          {selectedService.vpnNode.name ?? selectedService.vpnNode.host}
                        </span>
                      </span>
                    ) : (
                      'none'
                    )}
                  </dd>
                  <dt>Provider URL</dt>
                  <dd>
                    {selectedService.subscriptionLink ? (
                      <>
                        <a
                          href={selectedService.subscriptionLink}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {selectedService.subscriptionLink}
                        </a>
                        <span className="cell-note">
                          Service diagnostic only. Device runtime payload is the app contract.
                        </span>
                      </>
                    ) : (
                      'none'
                    )}
                  </dd>
                  <dt>Error</dt>
                  <dd>{selectedService.error ?? 'none'}</dd>
                </dl>
              </div>

              <div className="detail-block">
                <div className="panel-heading">
                  <h3>Policy templates</h3>
                </div>
                {templatesLoading ? <p>Loading templates...</p> : null}
                {templatesError ? <div className="error-line">{templatesError}</div> : null}
                {!templatesLoading && !templatesError && policyTemplates.length === 0 ? (
                  <p className="muted">No policy templates yet.</p>
                ) : null}
                {policyTemplates.length > 0 ? (
                  <div className="configurator-template-list">
                    {policyTemplates.map((template) => (
                      <div className="configurator-template-item" key={template.id}>
                        <div>
                          <strong>{template.name}</strong>
                          <span className="cell-note">
                            {template.type} · updated {formatDate(template.updatedAt)}
                          </span>
                        </div>
                        {template.isDefault ? (
                          <span className="status-pill green">default</span>
                        ) : (
                          <span className="status-pill slate">custom</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="detail-block">
                <h3>Device configs</h3>
                {selectedService.deviceConfigs.length === 0 ? (
                  <p className="muted">
                    No device configs yet. Use `Regenerate config` to build a
                    service-level snapshot for existing provisions.
                  </p>
                ) : (
                  <div className="configurator-stack">
                    {selectedService.deviceConfigs.map((deviceConfig) => (
                      <article className="configurator-device-card" key={deviceConfig.id}>
                        <div className="configurator-card-header">
                          <div>
                            <strong>
                              {deviceConfig.deviceId
                                ? `Device ${deviceConfig.deviceId}`
                                : 'Unbound device config'}
                            </strong>
                            <span className="cell-note">
                              {deviceConfig.installId ?? 'No install id yet'}
                            </span>
                          </div>
                          <span
                            className={`status-pill ${statusTone(deviceConfig.status)}`}
                          >
                            {deviceConfig.status}
                          </span>
                        </div>

                        <dl className="detail-list compact">
                          <dt>Order</dt>
                          <dd>{deviceConfig.orderId ?? 'none'}</dd>
                          <dt>Client</dt>
                          <dd>{deviceConfig.clientId ?? 'none'}</dd>
                          <dt>Runtime</dt>
                          <dd>{deviceConfig.runtimeType ?? 'not generated'}</dd>
                          <dt>Protocol</dt>
                          <dd>{deviceConfig.protocol ?? 'not selected'}</dd>
                          <dt>Revision</dt>
                          <dd>{deviceConfig.configRevision ?? 'none'}</dd>
                          <dt>Generated</dt>
                          <dd>{formatDate(deviceConfig.generatedAt)}</dd>
                          <dt>Updated</dt>
                          <dd>{formatDate(deviceConfig.updatedAt)}</dd>
                          <dt>Node</dt>
                          <dd>
                            {deviceConfig.node ? (
                              <span className="node-label">
                                {renderCountryFlag(deviceConfig.node.country)}
                                <span>
                                  {deviceConfig.node.name ?? deviceConfig.node.host}
                                </span>
                              </span>
                            ) : (
                              'none'
                            )}
                          </dd>
                          <dt>Provider access</dt>
                          <dd>
                            {deviceConfig.providerAccesses.length > 0 ? (
                              <div className="configurator-provider-list">
                                {deviceConfig.providerAccesses.map((providerAccess) => {
                                  const providerLink = providerDiagnosticLink(providerAccess);

                                  return (
                                    <div key={providerAccess.id}>
                                    <strong>{providerAccess.provider}</strong>{' '}
                                    <span
                                      className={`status-pill ${statusTone(providerAccess.status)}`}
                                    >
                                      {providerAccess.status}
                                    </span>
                                    <span className="cell-note">
                                      login: {providerAccess.providerLogin ?? 'none'} · user:{' '}
                                      {providerAccess.providerUserId ?? 'none'} · synced{' '}
                                      {formatDate(providerAccess.lastSyncedAt)}
                                    </span>
                                      {providerLink ? (
                                        <button
                                          className="provider-link-button"
                                          onClick={() =>
                                            window.open(providerLink, '_blank', 'noopener,noreferrer')
                                          }
                                          type="button"
                                        >
                                          Open provider link
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              'none'
                            )}
                          </dd>
                          <dt>Error</dt>
                          <dd>{deviceConfig.lastError ?? 'none'}</dd>
                        </dl>

                        <div className="detail-block">
                          <h3>Routing policy</h3>
                          <pre className="json-block">
                            {formatJson(deviceConfig.routingPolicy ?? {})}
                          </pre>
                        </div>
                        <div className="detail-block">
                          <h3>Automation policy</h3>
                          <pre className="json-block">
                            {formatJson(deviceConfig.automationPolicy ?? {})}
                          </pre>
                        </div>
                        <div className="detail-block">
                          <h3>Telemetry profile</h3>
                          <pre className="json-block">
                            {formatJson(deviceConfig.telemetryProfile ?? {})}
                          </pre>
                        </div>
                        <div className="detail-block">
                          <h3>Runtime payload</h3>
                          <pre className="json-block">
                            {formatMaybeJsonText(deviceConfig.runtimePayload)}
                          </pre>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <h2>Configurator services</h2>
          <div className="row-actions filter-toolbar">
            <label className="inline-filter">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                {PROVISION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {listLoading ? <p>Loading configurator services...</p> : null}
        {listError ? <div className="error-line">{listError}</div> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>User</th>
                <th>Devices</th>
                <th>Revision</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr
                  key={service.id}
                  className={
                    service.id === selectedServiceId ? 'event-row active' : 'event-row'
                  }
                  onClick={() => setSelectedServiceId(service.id)}
                >
                  <td>
                    <strong>{service.planName ?? service.externalSubscriptionId}</strong>
                    <span className="cell-note">
                      {service.externalSubscriptionId}
                    </span>
                    <span className="cell-note">
                      node: {service.nodeName ?? 'none'} · protocol:{' '}
                      {service.protocols.join(', ') || 'none'}
                    </span>
                  </td>
                  <td>
                    {service.email}
                    <span className="cell-note">{service.externalUserId}</span>
                  </td>
                  <td>
                    {service.activeDeviceConfigCount}/{service.deviceConfigCount}
                    <span className="cell-note">
                      providers: {service.providers.join(', ') || 'none'}
                    </span>
                  </td>
                  <td>
                    {service.latestConfigRevision ?? 'none'}
                    <span className="cell-note">
                      {formatDate(service.latestGeneratedAt)}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${statusTone(service.status)}`}>
                      {service.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={CONFIGURATOR_PAGE_SIZE}
          onPageChange={setPage}
        />
      </section>
    </section>
  );
}

function AppPoliciesPanel({
  mode,
  refreshVersion,
}: {
  mode: 'routing' | 'automation';
  refreshVersion: number;
}) {
  const api = useMemo(() => new ApiClient(DEFAULT_API_SETTINGS), []);
  const [apps, setApps] = useState<AppPolicyApp[]>([]);
  const [templates, setTemplates] = useState<ConfiguratorPolicyTemplate[]>([]);
  const [appForm, setAppForm] = useState<AppPolicyAppFormState>(
    emptyAppPolicyAppForm,
  );
  const [routingForm, setRoutingForm] = useState<RoutingProfileFormState>(
    emptyRoutingProfileForm,
  );
  const [automationForm, setAutomationForm] =
    useState<AutomationProfileFormState>(emptyAutomationProfileForm);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingRoutingId, setEditingRoutingId] = useState<string | null>(null);
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);

  const routingTemplates = templates.filter((template) => template.type === 'routing');
  const automationTemplates = templates.filter(
    (template) => template.type === 'automation',
  );
  const selectedTemplates =
    mode === 'routing' ? routingTemplates : automationTemplates;
  const policyTitle = mode === 'routing' ? 'App Routing' : 'Auto On/Off';
  const profileTitle =
    mode === 'routing' ? 'Routing profiles' : 'Automation profiles';
  const profileCountLabel =
    mode === 'routing'
      ? `routing: ${routingTemplates.length}`
      : `automation: ${automationTemplates.length}`;

  useEffect(() => {
    let cancelled = false;

    async function loadPolicies() {
      setLoading(true);
      setError('');
      try {
        const [loadedApps, loadedTemplates] = await Promise.all([
          api.get<AppPolicyApp[]>('/configurator/apps'),
          api.get<ConfiguratorPolicyTemplate[]>('/configurator/policy-templates'),
        ]);

        if (!cancelled) {
          setApps(loadedApps);
          setTemplates(loadedTemplates);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setApps([]);
          setTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPolicies();

    return () => {
      cancelled = true;
    };
  }, [api, refreshVersion, reloadVersion]);

  useEffect(() => {
    if (mode !== 'automation' || editingAutomationId !== null) {
      return;
    }

    const defaultTemplate =
      templates.find(
        (template) => template.type === 'automation' && template.isDefault,
      ) ?? templates.find((template) => template.type === 'automation');

    if (defaultTemplate) {
      setAutomationTemplateForm(defaultTemplate);
    }
  }, [editingAutomationId, mode, templates]);

  async function saveApp(event: FormEvent) {
    event.preventDefault();
    await runPolicyAction('Application saved', async () => {
      const payload = buildAppPolicyAppPayload(appForm);
      if (editingAppId) {
        await api.patch<AppPolicyApp>(`/configurator/apps/${editingAppId}`, payload);
      } else {
        await api.post<AppPolicyApp>('/configurator/apps', payload);
      }
      resetAppForm();
    });
  }

  async function saveRoutingProfile(event: FormEvent) {
    event.preventDefault();
    await runPolicyAction('Routing profile saved', async () => {
      const payload = {
        name: routingForm.name.trim(),
        type: 'routing',
        payload: buildRoutingPolicyPayload(routingForm),
        isDefault: routingForm.isDefault,
      };

      if (editingRoutingId) {
        await api.patch<ConfiguratorPolicyTemplate>(
          `/configurator/policy-templates/${editingRoutingId}`,
          payload,
        );
      } else {
        await api.post<ConfiguratorPolicyTemplate>(
          '/configurator/policy-templates',
          payload,
        );
      }
      resetRoutingForm();
    });
  }

  async function saveAutomationProfile(event: FormEvent) {
    event.preventDefault();
    await runPolicyAction('Automation profile saved', async () => {
      const payload = {
        name: automationForm.name.trim(),
        type: 'automation',
        payload: buildAutomationPolicyPayload(automationForm),
        isDefault: automationForm.isDefault,
      };

      if (editingAutomationId) {
        await api.patch<ConfiguratorPolicyTemplate>(
          `/configurator/policy-templates/${editingAutomationId}`,
          payload,
        );
      } else {
        await api.post<ConfiguratorPolicyTemplate>(
          '/configurator/policy-templates',
          payload,
        );
      }
      resetAutomationForm();
    });
  }

  async function deleteApp(app: AppPolicyApp) {
    const confirmed = window.confirm(`Delete ${app.name} from the catalog?`);
    if (!confirmed) {
      return;
    }

    await runPolicyAction('Application deleted', async () => {
      await api.delete(`/configurator/apps/${app.id}`);
      if (editingAppId === app.id) {
        resetAppForm();
      }
    });
  }

  async function deletePolicyTemplate(template: ConfiguratorPolicyTemplate) {
    const confirmed = window.confirm(`Delete ${template.name}?`);
    if (!confirmed) {
      return;
    }

    await runPolicyAction('Policy profile deleted', async () => {
      await api.delete(`/configurator/policy-templates/${template.id}`);
      if (editingRoutingId === template.id) {
        resetRoutingForm();
      }
      if (editingAutomationId === template.id) {
        resetAutomationForm();
      }
    });
  }

  async function runPolicyAction(messageText: string, action: () => Promise<void>) {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(messageText);
      setReloadVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  function editApp(app: AppPolicyApp) {
    setEditingAppId(app.id);
    setAppForm({
      name: app.name,
      packageName: app.packageName,
      platform: app.platform,
      category: app.category ?? '',
      iconUrl: app.iconUrl ?? '',
      notes: app.notes ?? '',
      isActive: app.isActive,
    });
  }

  function editRoutingTemplate(template: ConfiguratorPolicyTemplate) {
    setEditingRoutingId(template.id);
    setRoutingForm({
      name: template.name,
      mode: policyPayloadString(template.payload, 'mode', 'selected_apps'),
      includedApps: packageTextFromPayload(
        template.payload.includedApps ?? template.payload.default_enabled_apps,
      ),
      excludedApps: packageTextFromPayload(
        template.payload.excludedApps ?? template.payload.default_excluded_apps,
      ),
      isDefault: template.isDefault,
    });
  }

  function editAutomationTemplate(template: ConfiguratorPolicyTemplate) {
    setAutomationTemplateForm(template);
  }

  function setAutomationTemplateForm(template: ConfiguratorPolicyTemplate) {
    setEditingAutomationId(template.id);
    setAutomationForm({
      name: template.name,
      autoConnectApps: packageTextFromPayload(
        template.payload.autoConnectApps ?? template.payload.auto_enable_apps,
      ),
      autoDisconnectApps: packageTextFromPayload(
        template.payload.autoDisconnectApps ?? template.payload.auto_disable_apps,
      ),
      isDefault: template.isDefault,
    });
  }

  function resetAppForm() {
    setEditingAppId(null);
    setAppForm(emptyAppPolicyAppForm);
  }

  function resetRoutingForm() {
    setEditingRoutingId(null);
    setRoutingForm(emptyRoutingProfileForm);
  }

  function resetAutomationForm() {
    setEditingAutomationId(null);
    setAutomationForm(emptyAutomationProfileForm);
  }

  function setAutomationPackage(
    target: 'autoConnectApps' | 'autoDisconnectApps',
    packageName: string,
    enabled: boolean,
  ) {
    const opposite =
      target === 'autoConnectApps' ? 'autoDisconnectApps' : 'autoConnectApps';

    setAutomationForm((current) => ({
      ...current,
      [target]: updatePackageText(current[target], packageName, enabled),
      ...(enabled
        ? { [opposite]: updatePackageText(current[opposite], packageName, false) }
        : {}),
    }));
  }

  return (
    <section className="split-layout app-policies-layout">
      <div className="policy-form-stack">
        <form className="panel form-panel" onSubmit={saveApp}>
          <h2>{editingAppId ? 'Edit App' : 'Add App'}</h2>
          <label>
            App name
            <input
              required
              value={appForm.name}
              onChange={(event) => setAppForm({ ...appForm, name: event.target.value })}
            />
          </label>
          <label>
            Package name
            <input
              required
              placeholder="org.telegram.messenger"
              value={appForm.packageName}
              onChange={(event) =>
                setAppForm({ ...appForm, packageName: event.target.value })
              }
            />
          </label>
          <label>
            Category
            <input
              placeholder="messenger"
              value={appForm.category}
              onChange={(event) =>
                setAppForm({ ...appForm, category: event.target.value })
              }
            />
          </label>
          <label>
            Icon URL
            <input
              placeholder="https://example.com/icon.png"
              value={appForm.iconUrl}
              onChange={(event) =>
                setAppForm({ ...appForm, iconUrl: event.target.value })
              }
            />
          </label>
          <label>
            Platform
            <input
              value={appForm.platform}
              onChange={(event) =>
                setAppForm({ ...appForm, platform: event.target.value })
              }
            />
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={appForm.notes}
              onChange={(event) =>
                setAppForm({ ...appForm, notes: event.target.value })
              }
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={appForm.isActive}
              onChange={(event) =>
                setAppForm({ ...appForm, isActive: event.target.checked })
              }
            />
            Active
          </label>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={saving}>
              {editingAppId ? 'Save app' : 'Add app'}
            </button>
            {editingAppId ? (
              <button type="button" onClick={resetAppForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        {mode === 'routing' ? (
        <form className="panel form-panel" onSubmit={saveRoutingProfile}>
          <h2>{editingRoutingId ? 'Edit Routing' : 'Routing Profile'}</h2>
          <label>
            Profile name
            <input
              required
              value={routingForm.name}
              onChange={(event) =>
                setRoutingForm({ ...routingForm, name: event.target.value })
              }
            />
          </label>
          <label>
            Mode
            <select
              value={routingForm.mode}
              onChange={(event) =>
                setRoutingForm({ ...routingForm, mode: event.target.value })
              }
            >
              <option value="selected_apps">Selected apps</option>
              <option value="all_except">All except excluded</option>
              <option value="all_apps">All apps</option>
            </select>
          </label>
          <label>
            Included packages
            <textarea
              rows={5}
              placeholder="one package per line"
              value={routingForm.includedApps}
              onChange={(event) =>
                setRoutingForm({ ...routingForm, includedApps: event.target.value })
              }
            />
          </label>
          <label>
            Excluded packages
            <textarea
              rows={4}
              placeholder="one package per line"
              value={routingForm.excludedApps}
              onChange={(event) =>
                setRoutingForm({ ...routingForm, excludedApps: event.target.value })
              }
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={routingForm.isDefault}
              onChange={(event) =>
                setRoutingForm({ ...routingForm, isDefault: event.target.checked })
              }
            />
            Default routing profile
          </label>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={saving}>
              Save routing
            </button>
            {editingRoutingId ? (
              <button type="button" onClick={resetRoutingForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        ) : null}

        {mode === 'automation' ? (
        <form className="panel form-panel" onSubmit={saveAutomationProfile}>
          <h2>{editingAutomationId ? 'Edit Automation' : 'Automation Profile'}</h2>
          <p className="muted">
            App catalog checkboxes below build Auto ON and Auto OFF lists for this
            profile.
          </p>
          <label>
            Profile name
            <input
              required
              value={automationForm.name}
              onChange={(event) =>
                setAutomationForm({ ...automationForm, name: event.target.value })
              }
            />
          </label>
          <details className="manual-package-editor">
            <summary>Advanced package names</summary>
            <label>
              Auto ON package names
              <textarea
                rows={4}
                placeholder="one package per line"
                value={automationForm.autoConnectApps}
                onChange={(event) =>
                  setAutomationForm({
                    ...automationForm,
                    autoConnectApps: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Auto OFF package names
              <textarea
                rows={4}
                placeholder="one package per line"
                value={automationForm.autoDisconnectApps}
                onChange={(event) =>
                  setAutomationForm({
                    ...automationForm,
                    autoDisconnectApps: event.target.value,
                  })
                }
              />
            </label>
          </details>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={automationForm.isDefault}
              onChange={(event) =>
                setAutomationForm({
                  ...automationForm,
                  isDefault: event.target.checked,
                })
              }
            />
            Default automation profile
          </label>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={saving}>
              Save automation
            </button>
            {editingAutomationId ? (
              <button type="button" onClick={resetAutomationForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        ) : null}
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <h2>{policyTitle}</h2>
          <div className="pill-row">
            <span className="pill">apps: {apps.length}</span>
            <span className="pill">{profileCountLabel}</span>
          </div>
        </div>
        {loading ? <p>Loading app policies...</p> : null}
        {error ? <div className="error-line">{error}</div> : null}
        {message ? <div className="success-line">{message}</div> : null}

        <div className="policy-section">
          <h3>App catalog</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Application</th>
                  <th>Package</th>
                  <th>Category</th>
                  {mode === 'automation' ? <th>Auto ON</th> : null}
                  {mode === 'automation' ? <th>Auto OFF</th> : null}
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id}>
                    <td className="icon-cell">
                      <AppIcon app={app} />
                    </td>
                    <td>
                      <strong>{app.name}</strong>
                      <span className="cell-note">{app.platform}</span>
                    </td>
                    <td>{app.packageName}</td>
                    <td>{app.category ?? 'none'}</td>
                    {mode === 'automation' ? (
                      <td>
                        <label className="app-policy-check">
                          <input
                            type="checkbox"
                            checked={packageTextHas(
                              automationForm.autoConnectApps,
                              app.packageName,
                            )}
                            disabled={!app.isActive || saving}
                            onChange={(event) =>
                              setAutomationPackage(
                                'autoConnectApps',
                                app.packageName,
                                event.target.checked,
                              )
                            }
                          />
                        </label>
                      </td>
                    ) : null}
                    {mode === 'automation' ? (
                      <td>
                        <label className="app-policy-check">
                          <input
                            type="checkbox"
                            checked={packageTextHas(
                              automationForm.autoDisconnectApps,
                              app.packageName,
                            )}
                            disabled={!app.isActive || saving}
                            onChange={(event) =>
                              setAutomationPackage(
                                'autoDisconnectApps',
                                app.packageName,
                                event.target.checked,
                              )
                            }
                          />
                        </label>
                      </td>
                    ) : null}
                    <td>
                      <span className={`status-pill ${app.isActive ? 'green' : 'slate'}`}>
                        {app.isActive ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => editApp(app)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => void deleteApp(app)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="policy-section">
          <h3>{profileTitle}</h3>
          <PolicyTemplateList
            templates={selectedTemplates}
            onEdit={mode === 'routing' ? editRoutingTemplate : editAutomationTemplate}
            onDelete={deletePolicyTemplate}
          />
        </div>
      </section>
    </section>
  );
}

function AppIcon({ app }: { app: AppPolicyApp }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = app.iconUrl?.trim();

  if (iconUrl && !failed) {
    return (
      <img
        alt=""
        className="app-icon"
        loading="lazy"
        src={iconUrl}
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className="app-icon app-icon-fallback">{appIconInitials(app.name)}</span>;
}

function PolicyTemplateList({
  templates,
  onEdit,
  onDelete,
}: {
  templates: ConfiguratorPolicyTemplate[];
  onEdit: (template: ConfiguratorPolicyTemplate) => void;
  onDelete: (template: ConfiguratorPolicyTemplate) => void;
}) {
  if (templates.length === 0) {
    return <p className="muted">No profiles yet.</p>;
  }

  return (
    <div className="configurator-template-list">
      {templates.map((template) => (
        <div className="configurator-template-item" key={template.id}>
          <div>
            <strong>{template.name}</strong>
            <span className="cell-note">
              {template.isDefault ? 'default' : 'custom'} / updated{' '}
              {formatDate(template.updatedAt)}
            </span>
            <pre className="json-block compact-json">
              {formatJson(template.payload ?? {})}
            </pre>
          </div>
          <div className="row-actions">
            <button type="button" onClick={() => onEdit(template)}>
              Edit
            </button>
            <button type="button" onClick={() => onDelete(template)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebhookTesterPanel({
  form,
  plans,
  result,
  setForm,
  onRegenerate,
  onSend,
}: {
  form: WebhookFormState;
  plans: Plan[];
  result: string;
  setForm: (form: WebhookFormState) => void;
  onRegenerate: () => void;
  onSend: (event: FormEvent) => void;
}) {
  const needsPlan = form.event === 'payment_paid' || form.event === 'plan_changed';
  const needsPayment = form.event === 'payment_paid';

  function setEvent(event: BillingWebhookEvent) {
    setForm({
      ...form,
      event,
      status: event === 'payment_paid' ? 'paid' : '',
    });
  }

  return (
    <section className="split-layout">
      <form className="panel form-panel" onSubmit={onSend}>
        <h2>Send Test Webhook</h2>
        <label>
          Event
          <select
            value={form.event}
            onChange={(event) =>
              setEvent(event.target.value as BillingWebhookEvent)
            }
          >
            <option value="payment_paid">payment_paid</option>
            <option value="subscription_cancel">subscription_cancel</option>
            <option value="subscription_expired">subscription_expired</option>
            <option value="plan_changed">plan_changed</option>
          </select>
        </label>
        <label>
          Event ID
          <input
            required
            value={form.eventId}
            onChange={(event) =>
              setForm({ ...form, eventId: event.target.value })
            }
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          Subscription ID
          <input
            required
            value={form.externalSubscriptionId}
            onChange={(event) =>
              setForm({
                ...form,
                externalSubscriptionId: event.target.value,
              })
            }
          />
        </label>
        <label>
          User ID
          <input
            required
            value={form.externalUserId}
            onChange={(event) =>
              setForm({ ...form, externalUserId: event.target.value })
            }
          />
        </label>
        <label>
          Billing plan ID
          <input
            list="billing-plan-ids"
            required={needsPlan}
            value={form.externalPlanId}
            onChange={(event) =>
              setForm({ ...form, externalPlanId: event.target.value })
            }
          />
        </label>
        <datalist id="billing-plan-ids">
          {plans.map((plan) => (
            <option key={plan.id} value={plan.externalPlanId}>
              {plan.name}
            </option>
          ))}
        </datalist>
        <label>
          Payment ID
          <input
            required={needsPayment}
            value={form.externalPaymentId}
            onChange={(event) =>
              setForm({ ...form, externalPaymentId: event.target.value })
            }
          />
        </label>
        <label>
          Order ID
          <input
            value={form.externalOrderId}
            onChange={(event) =>
              setForm({ ...form, externalOrderId: event.target.value })
            }
          />
        </label>
        <label>
          Status
          <input
            required={needsPayment}
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value })
            }
          />
        </label>
        <label>
          Expires at
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) =>
              setForm({ ...form, expiresAt: event.target.value })
            }
          />
        </label>
        <div className="form-actions">
          <button className="primary" type="submit">
            Send webhook
          </button>
          <button type="button" onClick={onRegenerate}>
            Regenerate IDs
          </button>
        </div>
        {result ? <div className="success-line">{result}</div> : null}
      </form>
      <DataTable
        title="Webhook Contract"
        headers={['Event', 'Required fields', 'Result']}
        rows={[
          [
            'payment_paid',
            'eventId, user, subscription, payment, plan, email, status=paid',
            'create or renew provision',
          ],
          [
            'plan_changed',
            'eventId, user, subscription, plan, email',
            'update provision limits',
          ],
          [
            'subscription_cancel',
            'eventId, user, subscription, email',
            'cancel and schedule cleanup',
          ],
          [
            'subscription_expired',
            'eventId, user, subscription, email',
            'suspend and schedule cleanup',
          ],
        ]}
      />
    </section>
  );
}

function EventsPanel({
  initialEvents,
  queue,
  refreshVersion,
  onPurge,
  onRetry,
}: {
  initialEvents: ProcessedEvent[];
  queue?: QueueOverview;
  refreshVersion: number;
  onPurge: (options: {
    status: 'completed' | 'failed' | 'all-terminal';
    olderThanDays: number;
  }) => void;
  onRetry: (id: string) => void;
}) {
  const api = useMemo(() => new ApiClient(DEFAULT_API_SETTINGS), []);
  const [events, setEvents] = useState<ProcessedEvent[]>(initialEvents);
  const [totalItems, setTotalItems] = useState(initialEvents.length);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ProcessedEvent | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [purgeStatus, setPurgeStatus] = useState<
    'completed' | 'failed' | 'all-terminal'
  >('completed');
  const [purgeDays, setPurgeDays] = useState('30');
  const totalPages = Math.max(Math.ceil(totalItems / EVENTS_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setListLoading(true);
      setListError('');
      try {
        const query = new URLSearchParams({
          page: String(currentPage),
          limit: String(EVENTS_PAGE_SIZE),
        });

        if (statusFilter !== 'all') {
          query.set('status', statusFilter);
        }

        const response = await api.get<PaginatedResult<ProcessedEvent>>(
          `/processed-events?${query.toString()}`,
        );

        if (cancelled) {
          return;
        }

        const nextTotalPages = Math.max(
          Math.ceil(response.total / EVENTS_PAGE_SIZE),
          1,
        );

        if (response.items.length === 0 && response.total > 0 && currentPage > nextTotalPages) {
          setPage(nextTotalPages);
          return;
        }

        setEvents(response.items);
        setTotalItems(response.total);
      } catch (caught) {
        if (!cancelled) {
          setListError(caught instanceof Error ? caught.message : String(caught));
          setEvents([]);
          setTotalItems(0);
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [api, currentPage, refreshVersion, statusFilter]);

  useEffect(() => {
    if (events.length === 0) {
      setSelectedEventId(null);
      setSelectedEvent(null);
      setDetailsError('');
      return;
    }

    const existing = events.find((event) => event.id === selectedEventId);
    if (!existing) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }

    let cancelled = false;

    async function loadDetails() {
      setDetailsLoading(true);
      setDetailsError('');
      try {
        const details = await api.get<ProcessedEvent>(
          `/processed-events/${selectedEventId}`,
        );
        if (!cancelled) {
          setSelectedEvent(details);
        }
      } catch (caught) {
        if (!cancelled) {
          setSelectedEvent(null);
          setDetailsError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [api, refreshVersion, selectedEventId]);

  function handlePurge() {
    const olderThanDays = Number(purgeDays);
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      return;
    }

    onPurge({
      status: purgeStatus,
      olderThanDays,
    });
  }

  return (
    <>
      <section className="events-layout">
        <div className="events-sidebar">
          <DataTable
            title="Queue"
            className="queue-panel compact-table"
            headers={['State', 'Count']}
            rows={
              queue
                ? Object.entries(queue.counts).map(([state, count]) => [state, count])
                : []
            }
          />
          <section className="panel event-details-panel">
            <div className="panel-heading">
              <h2>Event Details</h2>
              <div className="row-actions">
                {selectedEvent?.status === 'failed' ? (
                  <button type="button" onClick={() => onRetry(selectedEvent.id)}>
                    Retry
                  </button>
                ) : null}
                {selectedEvent ? (
                  <span className={`status-pill ${statusTone(selectedEvent.status)}`}>
                    {selectedEvent.status}
                  </span>
                ) : null}
              </div>
            </div>
            {detailsLoading ? <p>Loading event details...</p> : null}
            {detailsError ? <div className="error-line">{detailsError}</div> : null}
            {!detailsLoading && !detailsError && !selectedEvent ? (
              <p className="muted">Select an event to inspect payload and errors.</p>
            ) : null}
            {!detailsLoading && !detailsError && selectedEvent ? (
              <div className="event-detail-layout">
                <div className="detail-block">
                  <h3>Meta</h3>
                  <dl className="detail-list compact">
                    <dt>Event ID</dt>
                    <dd>{selectedEvent.eventId}</dd>
                    <dt>Type</dt>
                    <dd>{selectedEvent.eventType}</dd>
                    <dt>User</dt>
                    <dd>{selectedEvent.externalUserId ?? 'none'}</dd>
                    <dt>Subscription</dt>
                    <dd>{selectedEvent.externalSubscriptionId ?? 'none'}</dd>
                    <dt>Order</dt>
                    <dd>{selectedEvent.externalOrderId ?? 'none'}</dd>
                    <dt>Payment</dt>
                    <dd>{selectedEvent.externalPaymentId ?? 'none'}</dd>
                    <dt>Plan</dt>
                    <dd>{selectedEvent.externalPlanId ?? 'none'}</dd>
                    <dt>Received</dt>
                    <dd>{formatDate(selectedEvent.receivedAt)}</dd>
                    <dt>Processed</dt>
                    <dd>{formatDate(selectedEvent.processedAt)}</dd>
                  </dl>
                </div>
                <div className="detail-block">
                  <h3>Error</h3>
                  <pre className="json-block">{selectedEvent.error ?? 'none'}</pre>
                  <h3>Payload</h3>
                  <pre className="json-block">
                    {formatJson(selectedEvent.payload ?? {})}
                  </pre>
                </div>
              </div>
            ) : null}
          </section>
        </div>
        <section className="panel table-panel events-table-panel">
          <div className="panel-heading">
            <h2>Processed Events</h2>
            <div className="row-actions filter-toolbar">
              <label className="inline-filter">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {EVENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-filter">
                Purge
                <select
                  value={purgeStatus}
                  onChange={(event) =>
                    setPurgeStatus(
                      event.target.value as 'completed' | 'failed' | 'all-terminal',
                    )
                  }
                >
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="all-terminal">All terminal</option>
                </select>
              </label>
              <label className="inline-filter">
                Older than
                <input
                  min="1"
                  step="1"
                  type="number"
                  value={purgeDays}
                  onChange={(event) => setPurgeDays(event.target.value)}
                />
                <span>days</span>
              </label>
              <button type="button" onClick={handlePurge}>
                Purge
              </button>
            </div>
          </div>
          {listLoading ? <p>Loading processed events...</p> : null}
          {listError ? <div className="error-line">{listError}</div> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Subscription</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className={event.id === selectedEventId ? 'event-row active' : 'event-row'}
                    onClick={() => setSelectedEventId(event.id)}
                  >
                    <td>{event.eventId}</td>
                    <td>{event.eventType}</td>
                    <td>{event.externalSubscriptionId ?? 'none'}</td>
                    <td>
                      <span className={`status-pill ${statusTone(event.status)}`}>
                        {event.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={EVENTS_PAGE_SIZE}
            onPageChange={setPage}
          />
        </section>
      </section>
    </>
  );
}

function AuditPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(Math.ceil(auditLogs.length / AUDIT_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const paged = paginate(auditLogs, currentPage, AUDIT_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [auditLogs.length]);

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <h2>Audit Logs</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Actor</th>
              <th>Entity</th>
              <th>Action</th>
              <th>Entity ID</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((log) => (
              <tr key={log.id}>
                <td>{log.actor ?? 'system'}</td>
                <td>{log.entityType}</td>
                <td>{log.action}</td>
                <td>{log.entityId ?? ''}</td>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls
        page={currentPage}
        totalPages={totalPages}
        totalItems={auditLogs.length}
        pageSize={AUDIT_PAGE_SIZE}
        onPageChange={setPage}
      />
    </section>
  );
}

function DataTable({
  title,
  actions,
  className,
  headers,
  rows,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <section className={`panel table-panel ${className ?? ''}`.trim()}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderCountryFlag(country?: string | null) {
  const code = resolveCountryCode(country);
  if (!code) {
    return null;
  }

  return (
    <span className="country-flag-wrap">
      <img
        className="country-flag"
        src={`https://flagcdn.com/16x12/${code}.png`}
        srcSet={`https://flagcdn.com/32x24/${code}.png 2x`}
        alt=""
        loading="lazy"
      />
    </span>
  );
}

function renderProviderLink(provider?: string | null) {
  if (!provider) {
    return 'none';
  }

  const trimmed = provider.trim();
  if (!trimmed) {
    return 'none';
  }

  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  return (
    <a href={href} target="_blank" rel="noreferrer">
      {trimmed}
    </a>
  );
}

function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="table-footer">
      <span className="pagination-info">
        {totalItems === 0 ? '0 items' : `${start}-${end} of ${totalItems}`}
      </span>
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">
          Prev
        </button>
        <span>
          Page {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function groupCounts(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function resolveCountryCode(country?: string | null): string | null {
  if (!country) {
    return null;
  }

  const normalized = country.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(normalized)) {
    return normalized;
  }

  const aliases: Record<string, string> = {
    netherlands: 'nl',
    holland: 'nl',
    germany: 'de',
    deutschland: 'de',
    finland: 'fi',
    france: 'fr',
    poland: 'pl',
    czechia: 'cz',
    czech: 'cz',
    lithuania: 'lt',
    latvia: 'lv',
    estonia: 'ee',
    romania: 'ro',
    bulgaria: 'bg',
    turkey: 'tr',
    russia: 'ru',
    kazakhstan: 'kz',
    singapore: 'sg',
    usa: 'us',
    us: 'us',
    'united states': 'us',
    canada: 'ca',
    uk: 'gb',
    'united kingdom': 'gb',
    britain: 'gb',
    england: 'gb',
  };

  return aliases[normalized] ?? null;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function formatRateLimit(limit: {
  enabled: boolean;
  max: number;
  windowMs: number;
}) {
  if (!limit.enabled) {
    return 'disabled';
  }

  const seconds = Math.max(1, Math.round(limit.windowMs / 1000));
  if (seconds % 60 === 0) {
    const minutes = Math.round(seconds / 60);
    return `${limit.max}/${minutes} min`;
  }

  return `${limit.max}/${seconds}s`;
}

function humanizeCron(cron: string): string {
  switch (cron.trim()) {
    case '*/5 * * * *':
      return 'every 5 min';
    case '*/15 * * * *':
      return 'every 15 min';
    case '0 * * * *':
      return 'every hour';
    default:
      return `cron ${cron}`;
  }
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatMaybeJsonText(value?: string | null): string {
  if (!value) {
    return 'not generated';
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function providerDiagnosticLink(
  providerAccess: ConfiguratorProviderAccess,
): string | null {
  return (
    metadataString(providerAccess.providerMetadata, 'subscriptionLink') ??
    metadataString(providerAccess.providerMetadata, 'resolvedLink')
  );
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildAppPolicyAppPayload(form: AppPolicyAppFormState) {
  return {
    name: form.name.trim(),
    packageName: form.packageName.trim(),
    platform: form.platform.trim() || 'android',
    category: optionalString(form.category),
    iconUrl: optionalString(form.iconUrl),
    notes: optionalString(form.notes),
    isActive: form.isActive,
  };
}

function buildRoutingPolicyPayload(form: RoutingProfileFormState) {
  return {
    version: 1,
    mode: form.mode,
    includedApps: packageListFromText(form.includedApps),
    excludedApps: packageListFromText(form.excludedApps),
  };
}

function buildAutomationPolicyPayload(form: AutomationProfileFormState) {
  return {
    version: 1,
    autoConnectApps: packageListFromText(form.autoConnectApps),
    autoDisconnectApps: packageListFromText(form.autoDisconnectApps),
    requiresUsageAccess: true,
  };
}

function packageListFromText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function packageTextHas(value: string, packageName: string): boolean {
  return packageListFromText(value).includes(packageName);
}

function updatePackageText(
  value: string,
  packageName: string,
  enabled: boolean,
): string {
  const packages = packageListFromText(value);
  const filtered = packages.filter((item) => item !== packageName);

  if (enabled) {
    filtered.push(packageName);
  }

  return filtered.join('\n');
}

function packageTextFromPayload(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .join('\n');
}

function policyPayloadString(
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = payload[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function buildPlanPayload(form: PlanFormState) {
  const normalizedMaxDevices = form.maxDevices.trim();

  return {
    billingProvider: form.billingProvider.trim() || null,
    name: form.name,
    ...(normalizedMaxDevices !== ''
      ? { maxDevices: Number(normalizedMaxDevices) }
      : {}),
    storageSize: form.storageSize,
    vpnEnabled: form.vpnEnabled,
    storageEnabled: form.storageEnabled,
  };
}

function buildWebhookPayload(form: WebhookFormState): BillingWebhookPayload {
  return {
    event: form.event,
    eventId: form.eventId.trim(),
    externalUserId: form.externalUserId.trim(),
    externalSubscriptionId: form.externalSubscriptionId.trim(),
    externalOrderId: optionalString(form.externalOrderId),
    externalPaymentId: optionalString(form.externalPaymentId),
    externalPlanId: optionalString(form.externalPlanId),
    email: form.email.trim(),
    status: optionalString(form.status),
    expiresAt: dateTimeLocalToIso(form.expiresAt),
  };
}

function optionalString(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function appIconInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((part) => part.trim().charAt(0))
    .filter((letter) => letter.length > 0)
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return letters || 'APP';
}

function formatDate(value?: string | null): string {
  if (!value) {
    return 'none';
  }

  return new Date(value).toLocaleString();
}

function formatDaysLeft(value?: string | null): string {
  if (!value) {
    return 'none';
  }

  const expiresAt = new Date(value).getTime();
  const diffMs = expiresAt - Date.now();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (days < 0) {
    return `expired ${Math.abs(days)}d ago`;
  }

  if (days === 0) {
    return 'less than 1d';
  }

  return `${days}d`;
}

function healthTone(value?: string | null): string {
  switch (value) {
    case 'online':
      return 'green';
    case 'degraded':
      return 'yellow';
    case 'offline':
      return 'red';
    default:
      return 'slate';
  }
}

function statusTone(value?: string | null): string {
  switch (value) {
    case 'ok':
    case 'online':
    case 'active':
    case 'completed':
    case 'paid':
      return 'green';
    case 'error':
    case 'offline':
    case 'failed':
    case 'cancelled':
    case 'deleted':
      return 'red';
    case 'degraded':
    case 'processing':
    case 'queued':
    case 'provisioning':
    case 'suspended':
    case 'delayed':
      return 'yellow';
    default:
      return 'teal';
  }
}

function createLocalDateTimeValue(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);

  return toDateTimeLocalValue(date);
}

function toDateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return new Date(trimmed).toISOString();
}
