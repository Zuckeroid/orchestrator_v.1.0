import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ApiClient,
  ApiSettings,
  AuditLog,
  BillingWebhookEvent,
  BillingWebhookPayload,
  HealthData,
  Plan,
  ProcessedEvent,
  Provision,
  QueueOverview,
  VpnNode,
} from '../api';
import { clearSettings, loadSettings, saveSettings } from '../storage';

type TabId =
  | 'dashboard'
  | 'plans'
  | 'nodes'
  | 'provisions'
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
}

interface ViewState {
  health?: HealthData;
  queue?: QueueOverview;
  plans: Plan[];
  nodes: VpnNode[];
  provisions: Provision[];
  events: ProcessedEvent[];
  auditLogs: AuditLog[];
}

const emptyViewState: ViewState = {
  plans: [],
  nodes: [],
  provisions: [],
  events: [],
  auditLogs: [],
};

const emptyPlanForm: PlanFormState = {
  externalPlanId: '',
  billingProvider: '',
  name: '',
  maxDevices: '3',
  storageSize: '10737418240',
  vpnEnabled: true,
  storageEnabled: true,
};

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
  };
}

export function App() {
  const [settings, setSettings] = useState<ApiSettings>(() => loadSettings());
  const [draftSettings, setDraftSettings] = useState<ApiSettings>(settings);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [view, setView] = useState<ViewState>(emptyViewState);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookFormState>(() =>
    createWebhookForm(),
  );
  const [webhookResult, setWebhookResult] = useState('');
  const [nodeForm, setNodeForm] = useState({
    name: '',
    host: '',
    apiKey: '',
    inboundId: '1',
    capacity: '100',
  });

  const api = useMemo(() => new ApiClient(settings), [settings]);
  const isConfigured = settings.adminApiKey.trim().length > 0;

  async function refreshAll() {
    if (!isConfigured) {
      setStatus('Enter an admin key to connect');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const [health, queue, plans, nodes, provisions, events, auditLogs] =
        await Promise.all([
          api.get<HealthData>('/health'),
          api.get<QueueOverview>('/jobs/queue'),
          api.get<Plan[]>('/plans'),
          api.get<VpnNode[]>('/nodes/vpn'),
          api.get<Provision[]>('/provisions?limit=50'),
          api.get<ProcessedEvent[]>('/processed-events?limit=50'),
          api.get<AuditLog[]>('/audit-logs?limit=50'),
        ]);

      setView({ health, queue, plans, nodes, provisions, events, auditLogs });
      setStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, [api, isConfigured]);

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

  function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    saveSettings(draftSettings);
    setSettings(draftSettings);
    setStatus('Settings saved');
  }

  function handleClearSettings() {
    clearSettings();
    const next = loadSettings();
    setSettings(next);
    setDraftSettings(next);
    setStatus('Settings cleared');
  }

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
      maxDevices: String(plan.maxDevices ?? 0),
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
    if (!settings.webhookApiKey || !settings.webhookSigningSecret) {
      setError('Enter webhook API key and signing secret in settings');
      return;
    }

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
    }));
    setWebhookResult('');
  }

  async function createNode(event: FormEvent) {
    event.preventDefault();
    await runAction('VPN node created', async () => {
      await api.post('/nodes/vpn', {
        name: nodeForm.name,
        host: nodeForm.host,
        apiKey: nodeForm.apiKey,
        apiVersion: '3x-ui',
        inboundId: Number(nodeForm.inboundId),
        capacity: Number(nodeForm.capacity),
      });
      setNodeForm({
        name: '',
        host: '',
        apiKey: '',
        inboundId: '1',
        capacity: '100',
      });
    });
  }

  async function disableNode(id: string) {
    await runAction('VPN node disabled', () => api.delete(`/nodes/vpn/${id}`));
  }

  async function deleteProvisionNow(id: string) {
    await runAction('Provision deleted', () =>
      api.post(`/provisions/${id}/delete-now`),
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
    { id: 'provisions', label: 'Provisions' },
    { id: 'webhook', label: 'Webhook Tester' },
    { id: 'events', label: 'Events' },
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
            <h1>{navItems.find((item) => item.id === activeTab)?.label}</h1>
            <p>{status}</p>
          </div>
          <button className="primary" onClick={refreshAll} disabled={isLoading}>
            {isLoading ? 'Refreshing' : 'Refresh'}
          </button>
        </header>

        <section className="settings-band">
          <form onSubmit={handleSaveSettings} className="settings-form">
            <label>
              API base URL
              <input
                value={draftSettings.apiBaseUrl}
                onChange={(event) =>
                  setDraftSettings({
                    ...draftSettings,
                    apiBaseUrl: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Admin key
              <input
                type="password"
                value={draftSettings.adminApiKey}
                onChange={(event) =>
                  setDraftSettings({
                    ...draftSettings,
                    adminApiKey: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Actor
              <input
                value={draftSettings.adminActor}
                onChange={(event) =>
                  setDraftSettings({
                    ...draftSettings,
                    adminActor: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Webhook key
              <input
                type="password"
                value={draftSettings.webhookApiKey}
                onChange={(event) =>
                  setDraftSettings({
                    ...draftSettings,
                    webhookApiKey: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Webhook secret
              <input
                type="password"
                value={draftSettings.webhookSigningSecret}
                onChange={(event) =>
                  setDraftSettings({
                    ...draftSettings,
                    webhookSigningSecret: event.target.value,
                  })
                }
              />
            </label>
            <button className="primary" type="submit">
              Save
            </button>
            <button type="button" onClick={handleClearSettings}>
              Clear
            </button>
          </form>
        </section>

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
            onCreate={createNode}
            onDisable={disableNode}
          />
        ) : null}
        {activeTab === 'provisions' ? (
          <ProvisionsPanel
            provisions={view.provisions}
            onDeleteNow={deleteProvisionNow}
          />
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
          <EventsPanel events={view.events} queue={view.queue} />
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
  const activeProvisions = view.provisions.filter(
    (item) => item.status === 'active',
  ).length;
  const failedEvents = view.events.filter((item) => item.status === 'failed').length;

  return (
    <>
      <section className="metric-grid">
        <Metric title="API" value={health?.status ?? 'unknown'} tone="green" />
        <Metric title="Database" value={health?.db ?? 'unknown'} tone="teal" />
        <Metric title="Redis" value={health?.redis ?? 'unknown'} tone="yellow" />
        <Metric title="Active provisions" value={activeProvisions} tone="green" />
        <Metric title="Failed events" value={failedEvents} tone="red" />
        <Metric title="Queue delayed" value={queue?.counts.delayed ?? 0} tone="yellow" />
      </section>
      <section className="content-grid">
        <NodeLoad nodes={view.nodes} />
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
            <div>
              <strong>{node.name ?? node.host}</strong>
              <span>
                {node.currentLoad}/{node.capacity} clients
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${Math.min(percent, 100)}%` }} />
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
          Max devices / IP limit
          <input
            required
            type="number"
            min="0"
            value={form.maxDevices}
            onChange={(event) =>
              setForm({ ...form, maxDevices: event.target.value })
            }
          />
        </label>
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
                <th>IP limit</th>
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
  onCreate,
  onDisable,
}: {
  nodes: VpnNode[];
  form: {
    name: string;
    host: string;
    apiKey: string;
    inboundId: string;
    capacity: string;
  };
  setForm: (form: {
    name: string;
    host: string;
    apiKey: string;
    inboundId: string;
    capacity: string;
  }) => void;
  onCreate: (event: FormEvent) => void;
  onDisable: (id: string) => void;
}) {
  return (
    <section className="split-layout">
      <form className="panel form-panel" onSubmit={onCreate}>
        <h2>Add VPN Node</h2>
        <label>
          Name
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
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
          3x-ui credentials
          <input
            required
            type="password"
            placeholder='{"username":"admin","password":"secret"}'
            value={form.apiKey}
            onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
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
          Add node
        </button>
      </form>
      <section className="panel table-panel">
        <h2>VPN Nodes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Host</th>
                <th>Status</th>
                <th>Load</th>
                <th>Inbound</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id}>
                  <td>{node.name ?? 'unnamed'}</td>
                  <td>{node.host}</td>
                  <td>{node.status}</td>
                  <td>
                    {node.currentLoad}/{node.capacity}
                  </td>
                  <td>{node.inboundId ?? 'none'}</td>
                  <td>
                    <button onClick={() => onDisable(node.id)} type="button">
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
  provisions,
  onDeleteNow,
}: {
  provisions: Provision[];
  onDeleteNow: (id: string) => void;
}) {
  return (
    <section className="panel table-panel">
      <h2>Provisions</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Subscription</th>
              <th>Status</th>
              <th>Storage</th>
              <th>VPN Login</th>
              <th>Link</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {provisions.map((provision) => (
              <tr key={provision.id}>
                <td>{provision.email}</td>
                <td>{provision.externalSubscriptionId}</td>
                <td>{provision.status}</td>
                <td>{provision.storageStatus}</td>
                <td>{provision.vpnLogin ?? 'none'}</td>
                <td>
                  {provision.subscriptionLink ? (
                    <a
                      href={provision.subscriptionLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : (
                    'none'
                  )}
                </td>
                <td>
                  <button
                    disabled={provision.status === 'deleted'}
                    onClick={() => onDeleteNow(provision.id)}
                    type="button"
                  >
                    Delete now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
  events,
  queue,
}: {
  events: ProcessedEvent[];
  queue?: QueueOverview;
}) {
  return (
    <section className="content-grid">
      <DataTable
        title="Queue"
        headers={['State', 'Count']}
        rows={
          queue
            ? Object.entries(queue.counts).map(([state, count]) => [state, count])
            : []
        }
      />
      <DataTable
        title="Processed Events"
        headers={['Event', 'Type', 'Subscription', 'Status', 'Error']}
        rows={events.map((event) => [
          event.eventId,
          event.eventType,
          event.externalSubscriptionId ?? 'none',
          event.status,
          event.error ?? '',
        ])}
      />
    </section>
  );
}

function AuditPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
  return (
    <DataTable
      title="Audit Logs"
      headers={['Actor', 'Entity', 'Action', 'Entity ID', 'Created']}
      rows={auditLogs.map((log) => [
        log.actor ?? 'system',
        log.entityType,
        log.action,
        log.entityId ?? '',
        new Date(log.createdAt).toLocaleString(),
      ])}
    />
  );
}

function DataTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
}) {
  return (
    <section className="panel table-panel">
      <h2>{title}</h2>
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
                  <td key={cellIndex}>{String(cell ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function groupCounts(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function buildPlanPayload(form: PlanFormState) {
  return {
    billingProvider: form.billingProvider.trim() || null,
    name: form.name,
    maxDevices: Number(form.maxDevices),
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
  };
}

function optionalString(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}
