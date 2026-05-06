import Nango from 'https://cdn.jsdelivr.net/npm/@nangohq/frontend@0.70.1/+esm';

const STORAGE_KEY = 'nango.demo.connection';

const state = {
    connection: loadConnection(),
    contacts: new Map(),
    // totalCount is the real Nango cache size for the connection (computed server-side from
    // webhook responseResults deltas). loadedCount is how many records this browser has
    // pulled from Nango — typically a small slice of the most recently changed records.
    totalCount: 0,
    loadedCount: 0,
    webhookHistory: [],
    isConnecting: false,
    isSyncing: false,
    searchQuery: '',
    eventSource: null,
    flashIds: new Set()
};

const els = {
    headerActions: document.getElementById('header-actions'),
    connectionPill: document.getElementById('connection-pill'),
    connectScreen: document.getElementById('connect-screen'),
    contactsScreen: document.getElementById('contacts-screen'),
    connectBtn: document.getElementById('connect-btn'),
    connectError: document.getElementById('connect-error'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    syncBtn: document.getElementById('sync-btn'),
    statTotal: document.getElementById('stat-total'),
    statLastWebhook: document.getElementById('stat-last-webhook'),
    statStream: document.getElementById('stat-stream'),
    tbody: document.getElementById('contacts-tbody'),
    emptyState: document.getElementById('empty-state'),
    loadingState: document.getElementById('loading-state'),
    searchInput: document.getElementById('search-input'),
    recordCount: document.getElementById('record-count'),
    webhookList: document.getElementById('webhook-list'),
    webhookCount: document.getElementById('webhook-count'),
    banner: document.getElementById('banner')
};

els.connectBtn.addEventListener('click', startConnect);
els.disconnectBtn.addEventListener('click', disconnect);
els.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    renderContacts();
});
els.syncBtn.addEventListener('click', triggerSync);

if (state.connection) {
    showConnectedScreen();
    init();
} else {
    showConnectScreen();
}

setInterval(renderRelativeTimes, 30_000);

async function init() {
    els.connectionPill.textContent = state.connection.connectionId;
    els.connectionPill.title = state.connection.connectionId;
    await loadInitialState();
    openEventStream();
}

async function loadInitialState() {
    if (!state.connection) return;
    showLoading(true);
    try {
        const params = new URLSearchParams({ connection_id: state.connection.connectionId });
        const res = await fetch(`/api/state?${params.toString()}`);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`State load failed (${res.status}): ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        state.contacts = new Map((data.records ?? []).map((r) => [r.id, r]));
        state.totalCount = data.totalCount ?? 0;
        state.loadedCount = data.loadedCount ?? state.contacts.size;
        state.webhookHistory = data.webhookHistory ?? [];
        clearBanner();
        renderAll();
    } catch (err) {
        showBanner(err.message, 'error');
    } finally {
        showLoading(false);
    }
}

function openEventStream() {
    if (!state.connection) return;
    if (state.eventSource) state.eventSource.close();

    const params = new URLSearchParams({ connection_id: state.connection.connectionId });
    const source = new EventSource(`/api/events?${params.toString()}`);
    state.eventSource = source;
    setStreamStatus('connecting…', 'muted');

    source.onopen = () => setStreamStatus('connected', 'ok');

    source.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return;
        }
        handleStreamMessage(msg);
    };

    source.onerror = () => {
        setStreamStatus('reconnecting…', 'warn');
    };
}

function handleStreamMessage(msg) {
    switch (msg.type) {
        case 'hello':
            return;
        case 'webhook':
            addWebhook(msg.payload);
            return;
        case 'records-changed':
            applyChanges(msg.records ?? [], msg.totalCount ?? state.totalCount, msg.loadedCount);
            attachWebhookFetchResult(msg.webhookId, msg.records ?? []);
            return;
        case 'sync-error':
            attachWebhookError(msg.payload?.receivedAt, msg.payload?.error?.description ?? 'sync failed');
            return;
        case 'fetch-error':
            attachWebhookError(msg.webhookId, msg.message);
            return;
        default:
            return;
    }
}

function addWebhook(webhook) {
    state.webhookHistory.unshift({ ...webhook, _changed: null, _fetchError: null });
    if (state.webhookHistory.length > 25) state.webhookHistory.length = 25;
    renderWebhooks();
    updateLastWebhookStat();
}

function attachWebhookFetchResult(webhookId, records) {
    const target = state.webhookHistory.find((w) => w.receivedAt === webhookId);
    if (!target) return;
    target._changed = records.length;
    renderWebhooks();
}

function attachWebhookError(webhookId, message) {
    const target = state.webhookHistory.find((w) => w.receivedAt === webhookId);
    if (!target) return;
    target._fetchError = message;
    renderWebhooks();
}

function applyChanges(records, totalCount, loadedCount) {
    state.flashIds = new Set();
    for (const record of records) {
        const isDeleted = record.last_action === 'DELETED';
        if (isDeleted) {
            state.contacts.delete(record.id);
        } else {
            state.contacts.set(record.id, record);
            state.flashIds.add(record.id);
        }
    }
    state.totalCount = totalCount;
    state.loadedCount = typeof loadedCount === 'number' ? loadedCount : state.contacts.size;
    renderTotalCount();
    renderContacts();
    setTimeout(() => {
        state.flashIds = new Set();
        renderContacts();
    }, 2000);
}

async function startConnect() {
    if (state.isConnecting) return;
    state.isConnecting = true;
    els.connectBtn.disabled = true;
    els.connectBtn.textContent = 'Opening…';
    hideConnectError();

    try {
        const sessionRes = await fetch('/api/connect/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if (!sessionRes.ok) {
            const text = await sessionRes.text();
            throw new Error(`Could not create connect session (${sessionRes.status}): ${text.slice(0, 200)}`);
        }
        const { data } = await sessionRes.json();
        if (!data?.token) throw new Error('No session token returned');

        const nango = new Nango({ connectSessionToken: data.token });
        await nango.openConnectUI({
            onEvent: (event) => {
                if (event.type === 'connect') {
                    const { connectionId, providerConfigKey } = event.payload;
                    saveConnection({ connectionId, providerConfigKey });
                    state.connection = { connectionId, providerConfigKey };
                    showConnectedScreen();
                    init();
                } else if (event.type === 'close' || event.type === 'window_closed') {
                    resetConnectButton();
                } else if (event.type === 'error') {
                    showConnectError(event.payload?.message ?? 'Connection failed.');
                    resetConnectButton();
                }
            }
        });
    } catch (err) {
        showConnectError(err.message ?? String(err));
        resetConnectButton();
    }
}

function resetConnectButton() {
    state.isConnecting = false;
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'Connect HubSpot';
}

function disconnect() {
    if (!confirm('Forget this connection? You can reconnect after.')) return;
    if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
    }
    clearConnection();
    state.connection = null;
    state.contacts = new Map();
    state.totalCount = 0;
    state.loadedCount = 0;
    state.webhookHistory = [];
    showConnectScreen();
}

async function triggerSync() {
    if (!state.connection || state.isSyncing) return;
    state.isSyncing = true;
    els.syncBtn.disabled = true;
    const original = els.syncBtn.textContent;
    els.syncBtn.textContent = 'Syncing…';

    try {
        const res = await fetch('/api/sync/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection_id: state.connection.connectionId })
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Sync trigger failed (${res.status}): ${text.slice(0, 200)}`);
        }
        clearBanner();
    } catch (err) {
        showBanner(err.message, 'error');
    } finally {
        // Webhook will arrive via SSE — re-enable the button shortly.
        setTimeout(() => {
            state.isSyncing = false;
            els.syncBtn.disabled = false;
            els.syncBtn.textContent = original;
        }, 2000);
    }
}

function renderAll() {
    renderTotalCount();
    renderContacts();
    renderWebhooks();
    updateLastWebhookStat();
}

function renderTotalCount() {
    // totalCount is the Nango cache size derived from webhook deltas. Before the first
    // sync-completion webhook arrives we fall back to whatever we've loaded so the stat
    // is never lower than the visible record count.
    const total = Math.max(state.totalCount ?? 0, state.loadedCount ?? state.contacts.size);
    els.statTotal.textContent = total.toLocaleString();
}

function renderContacts() {
    const all = [...state.contacts.values()];
    const filtered = state.searchQuery
        ? all.filter((c) => {
              const haystack = [c.firstname, c.lastname, c.email, c.company, c.jobtitle]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
              return haystack.includes(state.searchQuery);
          })
        : all;

    const loaded = all.length;
    const total = Math.max(state.totalCount ?? 0, loaded);
    if (state.searchQuery) {
        els.recordCount.textContent = total > loaded
            ? `${filtered.length.toLocaleString()} of ${loaded.toLocaleString()} loaded (cache: ${total.toLocaleString()})`
            : `${filtered.length.toLocaleString()} of ${loaded.toLocaleString()} loaded`;
    } else {
        els.recordCount.textContent = total > loaded
            ? `${loaded.toLocaleString()} of ${total.toLocaleString()} loaded (most recently changed)`
            : `${loaded.toLocaleString()} loaded`;
    }

    if (all.length === 0) {
        els.emptyState.textContent =
            'No contacts in the Nango cache yet. Click "Sync now" or wait for the scheduled run.';
        els.emptyState.classList.remove('hidden');
        els.tbody.innerHTML = '';
        return;
    }

    if (filtered.length === 0) {
        els.emptyState.textContent = 'No contacts match your search.';
        els.emptyState.classList.remove('hidden');
        els.tbody.innerHTML = '';
        return;
    }

    els.emptyState.classList.add('hidden');
    els.tbody.innerHTML = filtered
        .sort((a, b) => byString(b.last_modified_at, a.last_modified_at))
        .slice(0, 500)
        .map((c) => rowHtml(c, state.flashIds.has(c.id)))
        .join('');
}

function rowHtml(c, flash) {
    const name = `${c.firstname ?? ''} ${c.lastname ?? ''}`.trim();
    return `
        <tr class="${flash ? 'flash' : ''}">
            <td>${name ? escapeHtml(name) : emptyCell()}</td>
            <td>${c.email ? escapeHtml(c.email) : emptyCell()}</td>
            <td>${c.phone ? escapeHtml(c.phone) : emptyCell()}</td>
            <td>${c.jobtitle ? escapeHtml(c.jobtitle) : emptyCell()}</td>
            <td>${c.company ? escapeHtml(c.company) : emptyCell()}</td>
            <td class="col-modified">${formatDateTime(c.lastmodifieddate ?? c.last_modified_at)}</td>
        </tr>
    `;
}

function renderWebhooks() {
    els.webhookCount.textContent = state.webhookHistory.length;
    if (state.webhookHistory.length === 0) {
        els.webhookList.innerHTML =
            '<div class="webhook-empty muted">Waiting for webhooks. Click "Sync now" or wait for the scheduled run.</div>';
        return;
    }
    els.webhookList.innerHTML = state.webhookHistory.map(webhookHtml).join('');
}

function webhookHtml(w) {
    const success = w.success !== false;
    const tone = success ? 'ok' : 'err';
    const r = w.responseResults ?? {};
    const added = r.added ?? 0;
    const updated = r.updated ?? 0;
    const deleted = r.deleted ?? 0;
    const totalChanged = added + updated + deleted;
    const time = formatRelative(w.receivedAt);
    const fetchedLine =
        w._fetchError != null
            ? `<div class="webhook-fetched err">Fetch failed: ${escapeHtml(w._fetchError)}</div>`
            : w._changed != null
              ? `<div class="webhook-fetched">Loaded ${w._changed} changed record${w._changed === 1 ? '' : 's'}</div>`
              : totalChanged > 0
                ? `<div class="webhook-fetched muted">Fetching changes…</div>`
                : '';
    const errorLine = w.error?.description
        ? `<div class="webhook-error">${escapeHtml(w.error.description)}</div>`
        : '';

    return `
        <div class="webhook-item ${tone}">
            <div class="webhook-row">
                <span class="webhook-type">${escapeHtml(w.type ?? 'event')}</span>
                <span class="webhook-status ${tone}">${success ? 'success' : 'failed'}</span>
                <span class="webhook-time muted" data-time="${escapeHtml(w.receivedAt ?? '')}">${time}</span>
            </div>
            <div class="webhook-row deltas">
                <span class="delta added">+${added}</span>
                <span class="delta updated">~${updated}</span>
                <span class="delta deleted">−${deleted}</span>
                <span class="muted webhook-sync">${escapeHtml(w.syncName ?? '')}</span>
            </div>
            ${fetchedLine}
            ${errorLine}
        </div>
    `;
}

function renderRelativeTimes() {
    document.querySelectorAll('.webhook-time[data-time]').forEach((el) => {
        const iso = el.getAttribute('data-time');
        if (iso) el.textContent = formatRelative(iso);
    });
}

function updateLastWebhookStat() {
    const latest = state.webhookHistory[0];
    if (!latest) {
        els.statLastWebhook.textContent = 'never';
        return;
    }
    els.statLastWebhook.textContent = formatRelative(latest.receivedAt);
}

function setStreamStatus(text, tone) {
    els.statStream.textContent = text;
    els.statStream.classList.remove('ok', 'warn', 'err', 'muted');
    els.statStream.classList.add(tone);
}

function showConnectScreen() {
    els.connectScreen.classList.remove('hidden');
    els.contactsScreen.classList.add('hidden');
    els.headerActions.classList.add('hidden');
}

function showConnectedScreen() {
    els.connectScreen.classList.add('hidden');
    els.contactsScreen.classList.remove('hidden');
    els.headerActions.classList.remove('hidden');
}

function showLoading(visible) {
    els.loadingState.classList.toggle('hidden', !visible);
}

function loadConnection() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveConnection(conn) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
}

function clearConnection() {
    localStorage.removeItem(STORAGE_KEY);
}

function emptyCell() {
    return '<span class="muted">—</span>';
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
}

function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatRelative(iso) {
    if (!iso) return 'unknown';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'unknown';
    const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showBanner(message, kind) {
    els.banner.textContent = message;
    els.banner.classList.remove('hidden', 'error');
    if (kind === 'error') els.banner.classList.add('error');
}

function clearBanner() {
    els.banner.textContent = '';
    els.banner.classList.add('hidden');
}

function showConnectError(message) {
    els.connectError.textContent = message;
    els.connectError.classList.remove('hidden');
}

function hideConnectError() {
    els.connectError.textContent = '';
    els.connectError.classList.add('hidden');
}

function byString(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
}
