import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ApiClient,
  ApiSettings,
  AuditLog,
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
  | 'events'
  | 'audit';

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

export function App() {
  const [settings, setSettings] = useState<ApiSettings>(() => loadSettings());
  const [draftSettings, setDraftSettings] = useState<ApiSettings>(settings);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [view, setView] = useState<ViewState>(emptyViewState);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [planForm, setPlanForm] = useState({
    externalPlanId: '',
    name: '',
    maxDevices: '3',
    storageSize: '10737418240',
  });
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
    await runAction('Plan created', async () => {
      await api.post('/plans', {
        externalPlanId: planForm.externalPlanId,
        name: planForm.name,
        maxDevices: Number(planForm.maxDevices),
        storageSize: planForm.storageSize,
      });
      setPlanForm({
        externalPlanId: '',
        name: '',
        maxDevices: '3',
        storageSize: '10737418240',
      });
    });
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
    { id: 'plans', label: 'Plans' },
    { id: 'nodes', label: 'VPN Nodes' },
    { id: 'provisions', label: 'Provisions' },
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
          <PlansPanel
            plans={view.plans}
            form={planForm}
            setForm={setPlanForm}
            onCreate={createPlan}
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

function PlansPanel({
  plans,
  form,
  setForm,
  onCreate,
}: {
  plans: Plan[];
  form: {
    externalPlanId: string;
    name: string;
    maxDevices: string;
    storageSize: string;
  };
  setForm: (form: {
    externalPlanId: string;
    name: string;
    maxDevices: string;
    storageSize: string;
  }) => void;
  onCreate: (event: FormEvent) => void;
}) {
  return (
    <section className="split-layout">
      <form className="panel form-panel" onSubmit={onCreate}>
        <h2>Create Plan</h2>
        <label>
          External plan ID
          <input
            required
            value={form.externalPlanId}
            onChange={(event) =>
              setForm({ ...form, externalPlanId: event.target.value })
            }
          />
        </label>
        <label>
          Name
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Max devices
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
        <button className="primary" type="submit">
          Create plan
        </button>
      </form>
      <DataTable
        title="Plans"
        headers={['Name', 'External ID', 'Devices', 'Storage', 'VPN', 'Storage']}
        rows={plans.map((plan) => [
          plan.name,
          plan.externalPlanId,
          plan.maxDevices ?? 'none',
          plan.storageSize ?? 'none',
          plan.vpnEnabled ? 'on' : 'off',
          plan.storageEnabled ? 'on' : 'off',
        ])}
      />
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
