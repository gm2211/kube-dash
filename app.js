const state = {
  view: "overview",
  search: "",
  quickFilters: [],
  namespace: "all",
  sorts: {},
  groupByPrefix: localStorage.getItem("kd-group-by-prefix") !== "false",
  collapsedGroups: new Set(readStoredJson("kd-collapsed-prefix-groups", [])),
  chartFilter: null,
  context: localStorage.getItem("kd-context") || "",
  contexts: [],
  apiAvailable: false,
  loading: false,
  lastError: "",
  selectedKey: null,
  shellSocket: null,
  logsSocket: null,
  logsResource: null,
  runSocket: null,
  describeResource: null,
  editResource: null,
  deleteConfirmation: null,
  metricsTimer: null,
  metrics: { nodes: [], pods: [], errors: [] },
  metricSamples: [],
  resources: {
    pods: [],
    deployments: [],
    services: [],
    nodes: [],
    events: [],
  },
};

const views = {
  overview: { title: "Overview", kind: "overview" },
  pods: { title: "Pods", kind: "pods" },
  deployments: { title: "Deployments", kind: "deployments" },
  services: { title: "Services", kind: "services" },
  nodes: { title: "Nodes", kind: "nodes" },
  events: { title: "Events", kind: "events" },
  commands: { title: "Commands", kind: "commands" },
};

const selectors = {
  viewTitle: document.querySelector("#viewTitle"),
  tableTitle: document.querySelector("#tableTitle"),
  tableHead: document.querySelector("#tableHead"),
  tableBody: document.querySelector("#tableBody"),
  resultCount: document.querySelector("#resultCount"),
  charts: document.querySelector("#charts"),
  stats: document.querySelector("#stats"),
  searchInput: document.querySelector("#searchInput"),
  quickFilters: document.querySelector("#quickFilters"),
  groupToggle: document.querySelector("#groupToggle"),
  loadButton: document.querySelector("#loadButton"),
  namespaceFilter: document.querySelector("#namespaceFilter"),
  importPanel: document.querySelector("#importPanel"),
  jsonInput: document.querySelector("#jsonInput"),
  importStatus: document.querySelector("#importStatus"),
  detailsPanel: document.querySelector("#detailsPanel"),
  contextName: document.querySelector("#contextName"),
  contextSelect: document.querySelector("#contextSelect"),
  contextRail: document.querySelector("#contextRail"),
  commandDialog: document.querySelector("#commandDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogHelp: document.querySelector("#dialogHelp"),
  commandOutput: document.querySelector("#commandOutput"),
  describeDialog: document.querySelector("#describeDialog"),
  describeTitle: document.querySelector("#describeTitle"),
  describeStatus: document.querySelector("#describeStatus"),
  describeOutput: document.querySelector("#describeOutput"),
  editDialog: document.querySelector("#editDialog"),
  editTitle: document.querySelector("#editTitle"),
  editStatus: document.querySelector("#editStatus"),
  editYaml: document.querySelector("#editYaml"),
  applyOutput: document.querySelector("#applyOutput"),
  confirmApply: document.querySelector("#confirmApply"),
  applyYaml: document.querySelector("#applyYaml"),
  deleteDialog: document.querySelector("#deleteDialog"),
  deleteTitle: document.querySelector("#deleteTitle"),
  deleteStatus: document.querySelector("#deleteStatus"),
  deleteName: document.querySelector("#deleteName"),
  deleteNamespace: document.querySelector("#deleteNamespace"),
  deleteContext: document.querySelector("#deleteContext"),
  deleteConfirmName: document.querySelector("#deleteConfirmName"),
  confirmDelete: document.querySelector("#confirmDelete"),
  runDialog: document.querySelector("#runDialog"),
  runTitle: document.querySelector("#runTitle"),
  runStatus: document.querySelector("#runStatus"),
  runOutput: document.querySelector("#runOutput"),
  shellDialog: document.querySelector("#shellDialog"),
  shellTitle: document.querySelector("#shellTitle"),
  shellStatus: document.querySelector("#shellStatus"),
  terminalOutput: document.querySelector("#terminalOutput"),
  logsDialog: document.querySelector("#logsDialog"),
  logsTitle: document.querySelector("#logsTitle"),
  logsStatus: document.querySelector("#logsStatus"),
  logsOutput: document.querySelector("#logsOutput"),
};

function readStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function init() {
  bindEvents();
  render();
  bootApi();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.selectedKey = null;
      state.quickFilters = [];
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
      state.chartFilter = null;
      render();
    });
  });

  selectors.loadButton.addEventListener("click", () => {
    selectors.importPanel.classList.toggle("collapsed");
    if (!selectors.importPanel.classList.contains("collapsed")) {
      selectors.jsonInput.focus();
    }
  });

  document.querySelector("#parseButton").addEventListener("click", parseInput);
  document.querySelector("#clearButton").addEventListener("click", () => {
    selectors.jsonInput.value = "";
    selectors.importStatus.textContent = "";
  });

  document.querySelector("#copyCollector").addEventListener("click", () => {
    copyText(document.querySelector("#collectorCommand").textContent);
    selectors.importStatus.textContent = "Collector command copied.";
  });

  document.querySelector("#fileInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    selectors.jsonInput.value = await file.text();
    parseInput();
  });

  selectors.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderTable();
  });

  selectors.groupToggle.checked = state.groupByPrefix;
  selectors.groupToggle.addEventListener("change", () => {
    state.groupByPrefix = selectors.groupToggle.checked;
    persistPreferences();
    renderTable();
  });

  selectors.namespaceFilter.addEventListener("change", (event) => {
    state.namespace = event.target.value;
    state.selectedKey = null;
    render();
  });

  selectors.contextSelect.addEventListener("change", () => switchContext(selectors.contextSelect.value));

  document.querySelector("#refreshButton").addEventListener("click", () => {
    bootApi();
  });

  document.querySelector("#copyCommand").addEventListener("click", () => {
    copyText(selectors.commandOutput.value);
  });

  document.querySelector("#closeShell").addEventListener("click", closeShell);
  document.querySelector("#sendInterrupt").addEventListener("click", () => sendShellInput("\u0003"));
  document.querySelector("#sendClear").addEventListener("click", () => {
    selectors.terminalOutput.textContent = "";
    sendShellInput("clear\r");
  });
  document.querySelector("#focusTerminal").addEventListener("click", () => selectors.terminalOutput.focus());
  selectors.shellDialog.addEventListener("close", closeShell);
  selectors.terminalOutput.addEventListener("keydown", handleTerminalKeydown);

  document.querySelector("#closeLogs").addEventListener("click", closeLogs);
  document.querySelector("#clearLogs").addEventListener("click", () => {
    selectors.logsOutput.textContent = "";
  });
  document.querySelector("#restartLogs").addEventListener("click", () => {
    if (state.logsResource) connectLogs(state.logsResource);
  });
  selectors.logsDialog.addEventListener("close", closeLogs);

  document.querySelector("#closeDescribe").addEventListener("click", closeDescribe);
  document.querySelector("#copyDescribe").addEventListener("click", () => copyText(selectors.describeOutput.textContent));
  document.querySelector("#refreshDescribe").addEventListener("click", () => {
    if (state.describeResource) loadDescribe(state.describeResource);
  });

  document.querySelector("#closeEdit").addEventListener("click", closeEdit);
  document.querySelector("#reloadYaml").addEventListener("click", () => {
    if (state.editResource) loadEditYaml(state.editResource);
  });
  document.querySelector("#copyYaml").addEventListener("click", () => copyText(selectors.editYaml.value));
  selectors.confirmApply.addEventListener("change", () => {
    selectors.applyYaml.disabled = !selectors.confirmApply.checked;
  });
  selectors.applyYaml.addEventListener("click", applyYaml);
  selectors.editDialog.addEventListener("close", closeEdit);

  document.querySelector("#closeDelete").addEventListener("click", () => closeDeleteConfirmation(false));
  document.querySelector("#cancelDelete").addEventListener("click", () => closeDeleteConfirmation(false));
  selectors.confirmDelete.addEventListener("click", () => closeDeleteConfirmation(true));
  selectors.deleteConfirmName.addEventListener("input", updateDeleteConfirmation);
  selectors.deleteConfirmName.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !selectors.confirmDelete.disabled) {
      event.preventDefault();
      closeDeleteConfirmation(true);
    }
  });
  selectors.deleteDialog.addEventListener("close", () => closeDeleteConfirmation(false));

  document.querySelector("#closeRun").addEventListener("click", closeRun);
  document.querySelector("#stopRun").addEventListener("click", stopRun);
  document.querySelector("#copyRunOutput").addEventListener("click", () => copyText(selectors.runOutput.textContent));
  document.querySelector("#clearRunOutput").addEventListener("click", () => {
    selectors.runOutput.textContent = "";
  });
  selectors.runDialog.addEventListener("close", closeRun);
}

async function bootApi() {
  state.loading = true;
  state.lastError = "";
  render();

  try {
    const response = await fetch("/api/contexts", { cache: "no-store" });
    if (!response.ok) throw new Error("The kd helper is not running.");
    const data = await response.json();
    state.apiAvailable = true;
    await loadPreferences();
    state.contexts = data.contexts || [];
    const savedContext = localStorage.getItem("kd-context") || "";
    state.context = state.contexts.includes(savedContext) ? savedContext : data.currentContext || state.contexts[0] || "";
    localStorage.setItem("kd-context", state.context);
    renderContexts();
    await loadResources();
    startMetricsPolling();
  } catch (error) {
    state.apiAvailable = false;
    state.loading = false;
    state.lastError = "Run `kd` from a terminal to load resources automatically.";
    selectors.importPanel.classList.remove("collapsed");
    render();
  }
}

async function loadPreferences() {
  if (!state.apiAvailable) return;
  try {
    const response = await fetch("/api/preferences", { cache: "no-store" });
    if (!response.ok) throw new Error("Preferences unavailable.");
    const data = await response.json();
    if (typeof data.preferences?.groupByPrefix === "boolean") {
      state.groupByPrefix = data.preferences.groupByPrefix;
      localStorage.setItem("kd-group-by-prefix", String(state.groupByPrefix));
      selectors.groupToggle.checked = state.groupByPrefix;
    }
  } catch (error) {
    selectors.groupToggle.checked = state.groupByPrefix;
  }
}

async function persistPreferences() {
  localStorage.setItem("kd-group-by-prefix", String(state.groupByPrefix));
  if (!state.apiAvailable) return;
  try {
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { groupByPrefix: state.groupByPrefix } }),
    });
  } catch (error) {
    // Local storage already preserves the preference for file/fallback mode.
  }
}

async function loadResources() {
  if (!state.apiAvailable) return;
  state.loading = true;
  state.lastError = "";
  state.selectedKey = null;
  render();

  try {
    const params = state.context ? `?context=${encodeURIComponent(state.context)}` : "";
    const response = await fetch(`/api/resources${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "kubectl failed to load resources.");
    ingest(data.resources);
    state.context = data.context || state.context;
    localStorage.setItem("kd-context", state.context);
    state.loading = false;
    state.lastError = "";
    renderContexts();
    render();
    loadMetrics();
  } catch (error) {
    state.loading = false;
    state.lastError = error.message;
    render();
  }
}

function startMetricsPolling() {
  if (state.metricsTimer) clearInterval(state.metricsTimer);
  loadMetrics();
  state.metricsTimer = setInterval(loadMetrics, 15000);
}

async function loadMetrics() {
  if (!state.apiAvailable) return;

  try {
    const params = state.context ? `?context=${encodeURIComponent(state.context)}` : "";
    const response = await fetch(`/api/metrics${params}`, { cache: "no-store" });
    const data = await response.json();
    state.metrics = {
      nodes: data.nodes || [],
      pods: data.pods || [],
      errors: data.errors || [],
    };

    const sample = metricsSample(state.metrics);
    if (sample) {
      state.metricSamples.push(sample);
      state.metricSamples = state.metricSamples.slice(-24);
    }
    renderCharts();
  } catch (error) {
    state.metrics = { nodes: [], pods: [], errors: [error.message] };
    renderCharts();
  }
}

function renderContexts() {
  selectors.contextName.textContent = state.context || "No context";
  selectors.contextSelect.innerHTML = state.contexts.length
    ? state.contexts
        .map((context) => `<option value="${escapeHtml(context)}">${escapeHtml(context)}</option>`)
        .join("")
    : `<option value="">Current context</option>`;
  selectors.contextSelect.value = state.context;
  renderContextRail();
}

function renderContextRail() {
  if (!selectors.contextRail) return;
  const contexts = state.contexts.length ? state.contexts : state.context ? [state.context] : [];
  const showRail = contexts.length > 1;
  selectors.contextRail.closest(".sidebar")?.classList.toggle("rail-collapsed", !showRail);
  if (!showRail) {
    selectors.contextRail.innerHTML = "";
    return;
  }
  selectors.contextRail.innerHTML = contexts.length
    ? contexts
        .map((context, index) => {
          const initials = contextInitials(context);
          const active = context === state.context ? " active" : "";
          const tone = ["cyan", "green", "magenta", "purple"][index % 4];
          return `<button class="rail-tile ${tone}${active}" type="button" data-context="${escapeHtml(context)}" title="${escapeHtml(context)}" aria-label="Switch to ${escapeHtml(context)}">${escapeHtml(initials)}</button>`;
        })
        .join("")
    : `<span class="rail-empty">kd</span>`;

  selectors.contextRail.querySelectorAll("[data-context]").forEach((button) => {
    button.addEventListener("click", () => switchContext(button.dataset.context));
  });
}

function contextInitials(context) {
  const parts = String(context || "kd")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const first = parts[0]?.[0] || "k";
  const second = parts.length > 1 ? parts[1][0] : parts[0]?.[1] || "d";
  return `${first}${second}`.toUpperCase();
}

function switchContext(context) {
  if (!context || context === state.context) return;
  state.context = context;
  state.metricSamples = [];
  state.metrics = { nodes: [], pods: [], errors: [] };
  localStorage.setItem("kd-context", state.context);
  renderContexts();
  loadResources();
}

function parseInput() {
  try {
    const value = selectors.jsonInput.value.trim();
    if (!value) throw new Error("Paste JSON output first.");
    const parsed = JSON.parse(value);
    ingest(parsed);
    selectors.importStatus.textContent = `Loaded ${allResources().length} resources.`;
    selectors.importPanel.classList.add("collapsed");
    state.selectedKey = null;
    render();
  } catch (error) {
    selectors.importStatus.textContent = error.message;
  }
}

function ingest(payload) {
  const buckets = { pods: [], deployments: [], services: [], nodes: [], events: [] };
  const items = Array.isArray(payload.items) ? payload.items : [payload];

  items.forEach((item) => {
    const kind = (item.kind || "").toLowerCase();
    if (kind === "pod") buckets.pods.push(normalize(item, "pods"));
    if (kind === "deployment") buckets.deployments.push(normalize(item, "deployments"));
    if (kind === "service") buckets.services.push(normalize(item, "services"));
    if (kind === "node") buckets.nodes.push(normalize(item, "nodes"));
    if (kind === "event") buckets.events.push(normalize(item, "events"));
  });

  state.resources = buckets;
  rebuildNamespaces();
}

function normalize(item, type) {
  const metadata = item.metadata || {};
  const namespace = metadata.namespace || "";
  const name = metadata.name || "(unnamed)";
  return {
    key: `${type}:${namespace}:${name}`,
    type,
    kind: item.kind || type,
    name,
    namespace,
    labels: metadata.labels || {},
    created: metadata.creationTimestamp || "",
    raw: item,
  };
}

function rebuildNamespaces() {
  const namespaces = [...new Set(allResources().map((resource) => resource.namespace).filter(Boolean))].sort();
  selectors.namespaceFilter.innerHTML = `<option value="all">All namespaces</option>${namespaces
    .map((namespace) => `<option value="${escapeHtml(namespace)}">${escapeHtml(namespace)}</option>`)
    .join("")}`;
  if (!namespaces.includes(state.namespace)) state.namespace = "all";
  selectors.namespaceFilter.value = state.namespace;
}

function render() {
  const view = views[state.view];
  selectors.contextName.textContent = state.context || (state.apiAvailable ? "No context" : "Not connected");
  document.querySelector("#collectorCommand").textContent = `${kubectlBase()} get pods,deployments,services,nodes,events -A -o json`;
  selectors.viewTitle.textContent = view.title;
  selectors.tableTitle.textContent = view.title === "Commands" ? "Command cookbook" : view.title;
  selectors.searchInput.disabled = view.kind === "commands";
  selectors.namespaceFilter.disabled = view.kind === "nodes" || view.kind === "commands";
  selectors.loadButton.hidden = state.apiAvailable;
  selectors.importPanel.classList.toggle("collapsed", state.apiAvailable || allResources().length > 0);
  selectors.charts.classList.toggle("collapsed", view.kind !== "overview");
  renderCharts();
  renderStats();
  renderQuickFilters();
  renderTable();
  renderDetails();
}

function renderStats() {
  const pods = state.resources.pods;
  const problemPods = pods.filter((pod) => podStatus(pod).tone !== "good").length;
  const eventWarnings = state.resources.events.filter((event) => event.raw.type === "Warning").length;
  const stats = [
    ["Pods", pods.length],
    ["Deployments", state.resources.deployments.length],
    ["Services", state.resources.services.length],
    ["Nodes", state.resources.nodes.length],
    ["Warnings", problemPods + eventWarnings],
  ];

  selectors.stats.innerHTML = stats
    .map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderQuickFilters() {
  const view = views[state.view].kind;
  if (!selectors.quickFilters) return;
  if (view === "commands") {
    selectors.quickFilters.classList.add("collapsed");
    selectors.quickFilters.innerHTML = "";
    return;
  }

  const options = quickFilterOptions(view);
  const visible = options.filter((option) => option.count > 0 || isQuickFilterActive(option));
  selectors.quickFilters.classList.toggle("collapsed", !visible.length);
  if (!visible.length) {
    selectors.quickFilters.innerHTML = "";
    return;
  }

  selectors.quickFilters.innerHTML = `
    <span>Quick filters</span>
    <div>
      ${visible
        .map((option) => {
          const active = isQuickFilterActive(option) ? " active" : "";
          return `<button class="quick-filter${active}" type="button" data-filter-id="${escapeHtml(option.id)}">${escapeHtml(option.label)} <strong>${option.count}</strong></button>`;
        })
        .join("")}
      ${state.quickFilters.length ? `<button class="quick-filter clear" type="button" data-clear-filters="true">Clear</button>` : ""}
    </div>`;

  selectors.quickFilters.querySelectorAll("[data-filter-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const option = options.find((item) => item.id === button.dataset.filterId);
      if (!option) return;
      toggleQuickFilter(option);
      render();
    });
  });
  selectors.quickFilters.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    state.quickFilters = [];
    render();
  });
}

function quickFilterOptions(view) {
  const rows = baseFilteredResources(view === "overview" ? "all" : view);
  const make = (id, label, filter) => ({ id, label, filter, count: rows.filter((resource) => quickFilterMatches(resource, filter)).length });

  if (view === "overview") {
    return [
      make("kind:pods", "Pods", { field: "resource", op: "=", value: "pod" }),
      make("kind:deployments", "Deployments", { field: "resource", op: "=", value: "deployment" }),
      make("kind:services", "Services", { field: "resource", op: "=", value: "service" }),
      make("kind:nodes", "Nodes", { field: "resource", op: "=", value: "node" }),
      make("status:warning", "Needs attention", { kind: "attention" }),
    ];
  }

  if (view === "pods") {
    return [
      make("pod:running", "Running", { field: "status", op: ":", value: "running" }),
      make("pod:waiting", "Waiting", { kind: "podTone", value: "warn" }),
      make("pod:failed", "Failed", { kind: "podTone", value: "bad" }),
      make("pod:restarts", "Restarts", { field: "restarts", op: ">", value: "0" }),
    ];
  }

  if (view === "deployments") {
    return [
      make("deploy:ready", "Ready", { kind: "deploymentReady", value: true }),
      make("deploy:not-ready", "Not ready", { kind: "deploymentReady", value: false }),
    ];
  }

  if (view === "services") {
    return [
      make("svc:clusterip", "ClusterIP", { field: "type", op: ":", value: "clusterip" }),
      make("svc:loadbalancer", "LoadBalancer", { field: "type", op: ":", value: "loadbalancer" }),
      make("svc:nodeport", "NodePort", { field: "type", op: ":", value: "nodeport" }),
    ];
  }

  if (view === "nodes") {
    return [
      make("node:ready", "Ready", { kind: "nodeReady", value: true }),
      make("node:not-ready", "Not ready", { kind: "nodeReady", value: false }),
    ];
  }

  if (view === "events") {
    return [
      make("event:warning", "Warnings", { field: "type", op: ":", value: "warning" }),
      make("event:normal", "Normal", { field: "type", op: ":", value: "normal" }),
    ];
  }

  return [];
}

function isQuickFilterActive(option) {
  return state.quickFilters.some((filter) => filter.id === option.id);
}

function toggleQuickFilter(option) {
  if (isQuickFilterActive(option)) {
    state.quickFilters = state.quickFilters.filter((filter) => filter.id !== option.id);
  } else {
    state.quickFilters = [...state.quickFilters, { id: option.id, filter: option.filter }];
  }
  state.selectedKey = null;
}

function quickFilterMatches(resource, filter) {
  if (filter.kind === "attention") {
    if (resource.type === "pods") return podStatus(resource).tone !== "good";
    if (resource.type === "events") return eventStatus(resource).tone !== "good";
    if (resource.type === "deployments") return deploymentReadySort(resource)[0] < 1;
    if (resource.type === "nodes") return nodeStatus(resource).tone !== "good";
    return false;
  }
  if (filter.kind === "podTone") return resource.type === "pods" && podStatus(resource).tone === filter.value;
  if (filter.kind === "deploymentReady") return resource.type === "deployments" && (deploymentReadySort(resource)[0] >= 1) === filter.value;
  if (filter.kind === "nodeReady") return resource.type === "nodes" && (nodeStatus(resource).tone === "good") === filter.value;
  return resourceFilterMatches(resource, filter);
}

function renderCharts() {
  if (!selectors.charts || views[state.view].kind !== "overview") return;

  const pods = state.resources.pods;
  const runningPods = pods.filter((pod) => podStatus(pod).tone === "good").length;
  const warningPods = pods.filter((pod) => podStatus(pod).tone === "warn").length;
  const failedPods = pods.length - runningPods - warningPods;
  const metricError = state.metrics.errors?.[0] || "";

  const requestSummary = resourceRequestSummary();

  selectors.charts.innerHTML = `
    ${pieCard("Resource Mix", [
      ["Pods", state.resources.pods.length, "#3d90ce", { kind: "resource", value: "pods", label: "Pods" }],
      ["Deployments", state.resources.deployments.length, "#00acc1", { kind: "resource", value: "deployments", label: "Deployments" }],
      ["Services", state.resources.services.length, "#7e57c2", { kind: "resource", value: "services", label: "Services" }],
      ["Nodes", state.resources.nodes.length, "#43a047", { kind: "resource", value: "nodes", label: "Nodes" }],
    ])}
    ${pieCard("Pod Status", [
      ["Running", runningPods, "#00a45a", { kind: "podStatus", value: "good", label: "Running pods" }],
      ["Waiting", warningPods, "#f9ab00", { kind: "podStatus", value: "warn", label: "Waiting pods" }],
      ["Other", failedPods, "#d93025", { kind: "podStatus", value: "bad", label: "Other pods" }],
    ])}
    ${timeSeriesCard("CPU", "Cluster CPU percent", "cpuPercent", "%", metricError, requestSummary.cpu)}
    ${timeSeriesCard("Memory", "Cluster memory percent", "memoryPercent", "%", metricError, requestSummary.memory)}
  `;
  bindChartFilters();
}

function pieCard(title, segments) {
  const total = segments.reduce((sum, [, value]) => sum + value, 0);
  return `
    <article class="chart-card">
      <div class="chart-head">
        <h3>${escapeHtml(title)}</h3>
        <span>${total} total</span>
      </div>
      <div class="pie-layout">
        ${pieSvg(segments, total, title)}
        <div class="legend">
          ${segments
            .map(([label, value, color, filter]) => legendRow(label, value, color, filter))
            .join("")}
        </div>
      </div>
    </article>`;
}

function pieSvg(segments, total, idSeed = "chart") {
  if (!total) return `<div class="pie empty" aria-hidden="true"></div>`;
  const gradientId = `pie-sheen-${slugId(idSeed)}`;
  let cursor = -90;
  const paths = segments
    .map(([label, value, color, filter]) => {
      if (!value) return "";
      const start = cursor;
      cursor += (value / total) * 360;
      const active = isChartFilterActive(filter);
      const dimmed = state.chartFilter && filter && !active ? " dimmed" : "";
      const attrs = filterAttributes(filter, label);
      if (value === total) {
        return `<circle class="pie-segment${active ? " active" : ""}${dimmed}" cx="50" cy="50" r="42" fill="${color}" ${attrs}></circle>`;
      }
      return `<path class="pie-segment${active ? " active" : ""}${dimmed}" d="${pieSlicePath(start, cursor)}" fill="${color}" ${attrs}></path>`;
    })
    .join("");
  return `<svg class="pie-svg" viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(total)} total">
    <defs>
      <radialGradient id="${gradientId}" cx="34%" cy="26%" r="68%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"></stop>
        <stop offset="38%" stop-color="#ffffff" stop-opacity="0.07"></stop>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
      </radialGradient>
    </defs>
    <circle class="pie-halo" cx="50" cy="50" r="42"></circle>
    <g class="pie-slices">${paths}</g>
    <circle class="pie-sheen" cx="50" cy="50" r="42" fill="url(#${gradientId})"></circle>
    <circle class="pie-rim" cx="50" cy="50" r="42"></circle>
  </svg>`;
}

function legendRow(label, value, color, filter) {
  const active = isChartFilterActive(filter);
  const dimmed = state.chartFilter && filter && !active ? " dimmed" : "";
  const attrs = filterAttributes(filter, label);
  return `
    <button class="legend-row${active ? " active" : ""}${dimmed}" type="button" ${attrs}>
      <span class="swatch" style="background:${color}"></span>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </button>`;
}

function filterAttributes(filter, label) {
  if (!filter) return "";
  return `data-chart-filter="${escapeHtml(filter.kind)}" data-chart-value="${escapeHtml(filter.value)}" data-chart-label="${escapeHtml(filter.label || label)}" tabindex="0"`;
}

function pieSlicePath(startDeg, endDeg) {
  const center = 50;
  const radius = 42;
  const start = polarPoint(center, center, radius, endDeg);
  const end = polarPoint(center, center, radius, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${center} ${center} L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

function polarPoint(cx, cy, radius, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function slugId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart";
}

function bindChartFilters() {
  selectors.charts.querySelectorAll("[data-chart-filter]").forEach((item) => {
    item.addEventListener("click", () => applyChartFilter(item.dataset.chartFilter, item.dataset.chartValue, item.dataset.chartLabel));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        applyChartFilter(item.dataset.chartFilter, item.dataset.chartValue, item.dataset.chartLabel);
      }
    });
  });
}

function applyChartFilter(kind, value, label) {
  const same = state.chartFilter?.kind === kind && state.chartFilter?.value === value;
  state.chartFilter = same ? null : { kind, value, label };
  state.selectedKey = null;
  renderCharts();
  renderTable();
  renderDetails();
}

function isChartFilterActive(filter) {
  return Boolean(filter && state.chartFilter?.kind === filter.kind && state.chartFilter?.value === filter.value);
}

function clearChartFilter() {
  state.chartFilter = null;
  state.selectedKey = null;
  renderCharts();
  renderTable();
  renderDetails();
}

function timeSeriesCard(title, subtitle, field, unit, error, fallback) {
  const samples = state.metricSamples;
  const latest = samples.at(-1)?.[field];
  let body = "";
  let value = Number.isFinite(latest) ? `${latest.toFixed(1)}${unit}` : "Waiting";
  let note = "";

  if (samples.length >= 2) {
    body = `<svg class="sparkline" viewBox="0 0 240 92" preserveAspectRatio="none">
      <path d="${sparklinePath(samples, field)}"></path>
    </svg>`;
  } else if (fallback?.capacity > 0) {
    body = requestFallbackChart(fallback);
    value = `${fallback.percent.toFixed(1)}% requested`;
    note = error ? "Metrics API unavailable; showing requests" : "Showing requests until metrics arrive";
  } else {
    body = `<div class="chart-empty compact">${escapeHtml(error || "Waiting for metrics samples")}</div>`;
    value = "No data";
  }

  return `
    <article class="chart-card">
      <div class="chart-head">
        <h3>${escapeHtml(title)}</h3>
        <span>${escapeHtml(samples.length >= 2 ? subtitle : fallback?.subtitle || subtitle)}</span>
      </div>
      ${body}
      <div class="metric-value">${escapeHtml(value)}</div>
      ${note ? `<div class="chart-note">${escapeHtml(note)}</div>` : ""}
    </article>`;
}

function requestFallbackChart(summary) {
  const requested = Math.max(summary.requested, 0);
  const available = Math.max(summary.capacity - requested, 0);
  const segments = [
    ["Requested", requested, "#3d90ce", { kind: "request", value: summary.resource, label: `${summary.label} requested` }],
    ["Allocatable", available, "#8da0a5", { kind: "allocatable", value: summary.resource, label: `${summary.label} allocatable` }],
  ];
  return `
    <div class="pie-layout request-layout">
      ${pieSvg(segments, requested + available, `${summary.resource}-requests`)}
      <div class="legend">
        ${legendRow("Requested", summary.format(requested), "#3d90ce", segments[0][3])}
        ${legendRow("Allocatable", summary.format(summary.capacity), "#8da0a5", segments[1][3])}
      </div>
    </div>`;
}

function resourceRequestSummary() {
  const nodes = state.resources.nodes;
  const pods = state.resources.pods.filter((pod) => !["Succeeded", "Failed"].includes(pod.raw.status?.phase));
  const cpuCapacity = nodes.reduce((sum, node) => sum + parseCpuQuantity(node.raw.status?.allocatable?.cpu), 0);
  const memoryCapacity = nodes.reduce((sum, node) => sum + parseMemoryQuantity(node.raw.status?.allocatable?.memory), 0);
  const requested = pods.reduce(
    (totals, pod) => {
      const containers = pod.raw.spec?.containers || [];
      containers.forEach((container) => {
        totals.cpu += parseCpuQuantity(container.resources?.requests?.cpu);
        totals.memory += parseMemoryQuantity(container.resources?.requests?.memory);
      });
      return totals;
    },
    { cpu: 0, memory: 0 },
  );

  return {
    cpu: {
      resource: "cpu",
      label: "CPU",
      requested: requested.cpu,
      capacity: cpuCapacity,
      percent: percentage(requested.cpu, cpuCapacity),
      subtitle: "CPU requests vs allocatable",
      format: formatCpu,
    },
    memory: {
      resource: "memory",
      label: "Memory",
      requested: requested.memory,
      capacity: memoryCapacity,
      percent: percentage(requested.memory, memoryCapacity),
      subtitle: "Memory requests vs allocatable",
      format: formatMemory,
    },
  };
}

function parseCpuQuantity(value) {
  if (!value) return 0;
  const text = String(value).trim();
  if (text.endsWith("m")) return Number.parseFloat(text.slice(0, -1)) || 0;
  if (text.endsWith("n")) return (Number.parseFloat(text.slice(0, -1)) || 0) / 1000000;
  if (text.endsWith("u")) return (Number.parseFloat(text.slice(0, -1)) || 0) / 1000;
  return (Number.parseFloat(text) || 0) * 1000;
}

function parseMemoryQuantity(value) {
  if (!value) return 0;
  const text = String(value).trim();
  const units = {
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    Ti: 1024 * 1024,
    K: 1 / 1000,
    M: 1000 / 1024,
    G: 1000 * 1000 / 1024,
  };
  const suffix = Object.keys(units).find((unit) => text.endsWith(unit));
  if (suffix) return (Number.parseFloat(text.slice(0, -suffix.length)) || 0) * units[suffix];
  return (Number.parseFloat(text) || 0) / 1024 / 1024;
}

function percentage(value, total) {
  return total > 0 ? Math.min((value / total) * 100, 999) : 0;
}

function formatCpu(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} cores` : `${Math.round(value)}m`;
}

function formatMemory(value) {
  return value >= 1024 ? `${(value / 1024).toFixed(1)} Gi` : `${Math.round(value)} Mi`;
}

function metricsSample(metrics) {
  const nodes = metrics.nodes || [];
  if (!nodes.length) return null;
  const averageCpu = average(nodes.map((node) => node.cpuPercent));
  const averageMemory = average(nodes.map((node) => node.memoryPercent));
  return {
    time: Date.now(),
    cpuPercent: averageCpu,
    memoryPercent: averageMemory,
  };
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function sparklinePath(samples, field) {
  const values = samples.map((sample) => sample[field]).filter((value) => Number.isFinite(value));
  const max = Math.max(100, ...values);
  const width = 240;
  const height = 92;
  return samples
    .map((sample, index) => {
      const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * width;
      const y = height - (Math.min(sample[field] || 0, max) / max) * (height - 10) - 5;
      return `${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function renderTable() {
  const view = views[state.view].kind;
  if (view === "commands") return renderCommands();

  const rows = filteredResources(view === "overview" ? "all" : view);
  const columns = tableColumns(view);
  const sortedRows = sortRows(rows, columns, view);
  selectors.resultCount.innerHTML = chartFilterApplies()
    ? `${rows.length} shown · ${escapeHtml(state.chartFilter.label)} <button class="clear-filter" type="button">Clear</button>`
    : `${rows.length} shown`;
  selectors.resultCount.querySelector(".clear-filter")?.addEventListener("click", clearChartFilter);
  selectors.tableHead.innerHTML = `<tr>${columns.map((column) => tableHeader(column, view)).join("")}</tr>`;
  bindSortHeaders(view, columns);
  if (state.loading) {
    selectors.tableBody.innerHTML = `
      <tr>
        <td colspan="${columns.length}">
          <div class="empty-table">
            <strong>Loading resources</strong>
            <span>Running kubectl against ${escapeHtml(state.context || "the current context")}.</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  if (state.lastError) {
    selectors.tableBody.innerHTML = `
      <tr>
        <td colspan="${columns.length}">
          <div class="empty-table">
            <strong>Could not load resources</strong>
            <span>${escapeHtml(state.lastError)}</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  if (!sortedRows.length) {
    selectors.tableBody.innerHTML = `
      <tr>
        <td colspan="${columns.length}">
          <div class="empty-table">
            <strong>No resources found</strong>
            <span>${state.apiAvailable ? "This context returned no resources for this view." : "Run kd to load resources automatically."}</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  selectors.tableBody.innerHTML = tableRows(sortedRows, columns, view).join("");

  selectors.tableBody.querySelectorAll("tr[data-key]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedKey = row.dataset.key;
      renderTable();
      renderDetails();
    });
  });

  selectors.tableBody.querySelectorAll("[data-group-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.groupKey;
      if (state.collapsedGroups.has(key)) {
        state.collapsedGroups.delete(key);
      } else {
        state.collapsedGroups.add(key);
      }
      persistCollapsedGroups();
      renderTable();
    });
  });
}

function tableRows(rows, columns, view) {
  if (!state.groupByPrefix) return rows.map((resource) => resourceRow(resource, columns));

  const groups = buildPrefixGroups(rows, view);
  const renderedGroups = new Set();
  const output = [];
  rows.forEach((resource) => {
    const group = groups.get(resource.key);
    if (!group || group.items.length < 2) {
      output.push(resourceRow(resource, columns));
      return;
    }
    if (renderedGroups.has(group.key)) return;
    renderedGroups.add(group.key);
    const collapsed = state.collapsedGroups.has(group.key);
    output.push(groupRow(group, columns.length, collapsed));
    if (!collapsed) group.items.forEach((item) => output.push(resourceRow(item, columns, " grouped")));
  });
  return output;
}

function resourceRow(resource, columns, extraClass = "") {
  return `
    <tr class="${resource.key === state.selectedKey ? "selected" : ""}${extraClass}" data-key="${escapeHtml(resource.key)}">
      ${columns.map((column) => `<td>${column.render(resource)}</td>`).join("")}
    </tr>`;
}

function groupRow(group, columnCount, collapsed) {
  const namespace = group.namespace ? ` · ${group.namespace}` : "";
  const action = collapsed ? "Expand" : "Collapse";
  return `
    <tr class="group-row">
      <td colspan="${columnCount}">
        <button class="group-toggle" type="button" data-group-key="${escapeHtml(group.key)}" aria-expanded="${String(!collapsed)}" title="${action} ${escapeHtml(group.prefix)}">
          <span class="group-caret" aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
          <span>${escapeHtml(group.prefix)}</span>
          <strong>${group.items.length}</strong>
          <em>${escapeHtml(`${group.kind}${namespace}`)}</em>
        </button>
      </td>
    </tr>`;
}

function buildPrefixGroups(rows, view) {
  const scopes = new Map();
  rows.forEach((resource) => {
    const scope = groupScope(resource, view);
    const items = scopes.get(scope) || [];
    items.push({
      resource,
      basePrefix: resourcePrefix(resource.name),
    });
    scopes.set(scope, items);
  });

  const groupsByResource = new Map();
  scopes.forEach((items, scope) => {
    const counts = new Map();
    items.forEach((item) => {
      groupCandidates(item.basePrefix).forEach((prefix) => {
        counts.set(prefix, (counts.get(prefix) || 0) + 1);
      });
    });

    const candidates = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .sort(([left], [right]) => groupWeight(right) - groupWeight(left) || right.length - left.length || left.localeCompare(right));
    const assigned = new Set();

    candidates.forEach(([prefix]) => {
      const members = items.filter((item) => !assigned.has(item.resource.key) && groupCandidates(item.basePrefix).includes(prefix));
      if (members.length < 2) return;
      const resources = members.map((item) => item.resource);
      const group = {
        key: `${scope}:${prefix}`,
        prefix,
        kind: groupKind(resources),
        namespace: resources[0]?.namespace || "",
        items: resources,
      };
      resources.forEach((resource) => {
        assigned.add(resource.key);
        groupsByResource.set(resource.key, group);
      });
    });
  });
  return groupsByResource;
}

function groupScope(resource, view) {
  if (view === "overview") return `overview:${resource.namespace || "cluster"}`;
  return `${resource.type}:${resource.namespace || "cluster"}`;
}

function resourcePrefix(name) {
  const eventName = String(name || "").split(".")[0];
  const parts = eventName.split("-").filter(Boolean);
  if (parts.length < 2) return String(name || "");

  let end = parts.length;
  let stripped = 0;
  while (end > 1 && stripped < 3 && isGeneratedTailPart(parts[end - 1])) {
    end -= 1;
    stripped += 1;
  }
  if (end === parts.length || end < 1) return String(name || "");
  return parts.slice(0, end).join("-");
}

function isGeneratedTailPart(value) {
  const text = value || "";
  return /^[a-z0-9]{5}$/.test(text) || /^[0-9]{5,}$/.test(text) || (/^[a-z0-9]{6,12}$/.test(text) && /[0-9]/.test(text));
}

function groupCandidates(prefix) {
  const text = String(prefix || "");
  const parts = text.split("-").filter(Boolean);
  const candidates = new Set([text]);
  for (let index = 1; index < parts.length; index += 1) {
    const candidate = parts.slice(0, index).join("-");
    if (candidate.length >= 3) candidates.add(candidate);
  }
  return [...candidates].filter(Boolean);
}

function groupWeight(prefix) {
  return String(prefix || "").split("-").filter(Boolean).length * 100 + String(prefix || "").length;
}

function groupKind(resources) {
  const kinds = [...new Set(resources.map((resource) => resource.kind))];
  return kinds.length === 1 ? kinds[0] : "Resources";
}

function persistCollapsedGroups() {
  localStorage.setItem("kd-collapsed-prefix-groups", JSON.stringify([...state.collapsedGroups]));
}

function tableColumns(view) {
  const nameColumn = {
    id: "name",
    label: "Name",
    sort: (resource) => resource.name,
    render: (resource) => `
      <div class="name-cell">
        <strong>${escapeHtml(resource.name)}</strong>
        <span class="subtle">${escapeHtml(resource.kind)}${resource.namespace ? ` · ${escapeHtml(resource.namespace)}` : ""}</span>
      </div>`,
  };
  const ageColumn = { id: "age", label: "Age", sort: (resource) => ageMs(resource.created), defaultDir: "asc", render: (resource) => age(resource.created) };

  if (view === "pods") {
    return [
      nameColumn,
      { id: "status", label: "Status", sort: (resource) => podStatus(resource).label, render: (resource) => statusBadge(podStatus(resource)) },
      { id: "ready", label: "Ready", sort: (resource) => podReadySort(resource), render: (resource) => podReady(resource) },
      { id: "restarts", label: "Restarts", sort: (resource) => podRestarts(resource), render: (resource) => podRestarts(resource) },
      { id: "node", label: "Node", sort: (resource) => resource.raw.spec?.nodeName || "", render: (resource) => escapeHtml(resource.raw.spec?.nodeName || "-") },
      ageColumn,
    ];
  }

  if (view === "deployments") {
    return [
      nameColumn,
      { id: "ready", label: "Ready", sort: (resource) => deploymentReadySort(resource), render: (resource) => deploymentReady(resource) },
      { id: "replicas", label: "Replicas", sort: (resource) => resource.raw.spec?.replicas ?? 0, render: (resource) => resource.raw.spec?.replicas ?? 0 },
      { id: "updated", label: "Updated", sort: (resource) => resource.raw.status?.updatedReplicas ?? 0, render: (resource) => resource.raw.status?.updatedReplicas ?? 0 },
      ageColumn,
    ];
  }

  if (view === "services") {
    return [
      nameColumn,
      { id: "type", label: "Type", sort: (resource) => resource.raw.spec?.type || "", render: (resource) => escapeHtml(resource.raw.spec?.type || "-") },
      { id: "cluster-ip", label: "Cluster IP", sort: (resource) => ipSort(resource.raw.spec?.clusterIP), render: (resource) => escapeHtml(resource.raw.spec?.clusterIP || "-") },
      { id: "ports", label: "Ports", sort: servicePorts, render: servicePorts },
      ageColumn,
    ];
  }

  if (view === "nodes") {
    return [
      nameColumn,
      { id: "status", label: "Status", sort: (resource) => nodeStatus(resource).label, render: (resource) => statusBadge(nodeStatus(resource)) },
      { id: "internal-ip", label: "Internal IP", sort: (resource) => ipSort(nodeInternalIp(resource)), render: nodeInternalIp },
      { id: "kubelet", label: "Kubelet", sort: (resource) => resource.raw.status?.nodeInfo?.kubeletVersion || "", render: (resource) => escapeHtml(resource.raw.status?.nodeInfo?.kubeletVersion || "-") },
      ageColumn,
    ];
  }

  if (view === "events") {
    return [
      nameColumn,
      { id: "type", label: "Type", sort: (resource) => eventStatus(resource).label, render: (resource) => statusBadge(eventStatus(resource)) },
      { id: "reason", label: "Reason", sort: (resource) => resource.raw.reason || "", render: (resource) => escapeHtml(resource.raw.reason || "-") },
      { id: "object", label: "Object", sort: eventObject, render: eventObject },
      { id: "count", label: "Count", sort: (resource) => resource.raw.count ?? 1, defaultDir: "desc", render: (resource) => resource.raw.count ?? 1 },
      { id: "last-seen", label: "Last Seen", sort: (resource) => ageMs(resource.raw.lastTimestamp || resource.raw.eventTime || resource.created), defaultDir: "asc", render: (resource) => age(resource.raw.lastTimestamp || resource.raw.eventTime || resource.created) },
    ];
  }

  return [
    nameColumn,
    { id: "status", label: "Status", sort: (resource) => overviewSort(resource), render: overviewStatus },
    { id: "namespace", label: "Namespace", sort: (resource) => resource.namespace || "", render: (resource) => escapeHtml(resource.namespace || "-") },
    ageColumn,
  ];
}

function tableHeader(column, view) {
  if (!column.sort) return `<th>${escapeHtml(column.label)}</th>`;
  const sort = effectiveSort(view);
  const active = sort?.id === column.id;
  const dir = active ? sort.dir : "";
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  const indicator = active ? (dir === "asc" ? "▲" : "▼") : "";
  return `
    <th aria-sort="${ariaSort}">
      <button class="sort-button${active ? " active" : ""}" type="button" data-sort="${escapeHtml(column.id)}">
        <span>${escapeHtml(column.label)}</span>
        <span class="sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>`;
}

function bindSortHeaders(view, columns) {
  selectors.tableHead.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const column = columns.find((item) => item.id === button.dataset.sort);
      if (!column) return;
      const current = effectiveSort(view);
      const dir = current?.id === column.id ? (current.dir === "asc" ? "desc" : "asc") : column.defaultDir || "asc";
      state.sorts[view] = { id: column.id, dir };
      renderTable();
    });
  });
}

function sortRows(rows, columns, view) {
  const sort = effectiveSort(view);
  if (!sort) return rows;
  const column = columns.find((item) => item.id === sort.id && item.sort);
  if (!column) return rows;
  const direction = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const primary = compareSortValues(column.sort(left), column.sort(right));
    if (primary) return primary * direction;
    return compareSortValues(left.name, right.name);
  });
}

function effectiveSort(view) {
  return state.sorts[view] || { id: "name", dir: "asc" };
}

function compareSortValues(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftItems = Array.isArray(left) ? left : [left];
    const rightItems = Array.isArray(right) ? right : [right];
    const length = Math.max(leftItems.length, rightItems.length);
    for (let index = 0; index < length; index += 1) {
      const result = compareSortValues(leftItems[index], rightItems[index]);
      if (result) return result;
    }
    return 0;
  }

  const leftNumber = typeof left === "number" ? left : Number.NaN;
  const rightNumber = typeof right === "number" ? right : Number.NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function podReadySort(resource) {
  const statuses = resource.raw.status?.containerStatuses || [];
  const ready = statuses.filter((status) => status.ready).length;
  return [statuses.length ? ready / statuses.length : 0, ready, statuses.length];
}

function deploymentReadySort(resource) {
  const ready = resource.raw.status?.readyReplicas || 0;
  const desired = resource.raw.spec?.replicas || 0;
  return [desired ? ready / desired : 0, ready, desired];
}

function overviewSort(resource) {
  if (resource.type === "pods") return podStatus(resource).label;
  if (resource.type === "nodes") return nodeStatus(resource).label;
  if (resource.type === "events") return eventStatus(resource).label;
  if (resource.type === "deployments") return deploymentReady(resource);
  return "Active";
}

function ageMs(timestamp) {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const value = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(value) ? Math.max(0, value) : Number.POSITIVE_INFINITY;
}

function ipSort(value) {
  const text = String(value || "");
  const parts = text.split(".").map((part) => Number.parseInt(part, 10));
  return parts.length === 4 && parts.every((part) => Number.isFinite(part)) ? parts : text;
}

function filteredResources(kind) {
  return baseFilteredResources(kind).filter((resource) => state.quickFilters.every((filter) => quickFilterMatches(resource, filter.filter)));
}

function baseFilteredResources(kind) {
  const resources = kind === "all" ? allResources() : state.resources[kind] || [];
  const query = parseSearchQuery(state.search);
  return resources.filter((resource) => {
    const inNamespace = state.namespace === "all" || !resource.namespace || resource.namespace === state.namespace;
    return inNamespace && chartFilterMatches(resource) && searchMatches(resource, query);
  });
}

function parseSearchQuery(query) {
  const tokens = String(query || "").match(/"[^"]+"|\S+/g) || [];
  const filters = [];
  const terms = [];
  tokens.forEach((token) => {
    const text = token.replace(/^"|"$/g, "");
    const match = text.match(/^([a-z0-9_.\-/]+)(!?=|:|>=|<=|>|<)(.+)$/i);
    if (!match) {
      terms.push(text.toLowerCase());
      return;
    }
    filters.push({ field: match[1].toLowerCase(), op: match[2], value: match[3].replace(/^"|"$/g, "").toLowerCase() });
  });
  return { terms, filters };
}

function searchMatches(resource, query) {
  if (!query.terms.length && !query.filters.length) return true;
  const text = resourceSearchText(resource);
  return query.terms.every((term) => text.includes(term)) && query.filters.every((filter) => resourceFilterMatches(resource, filter));
}

function resourceSearchText(resource) {
  return [
    resource.kind,
    resource.type,
    resource.name,
    resource.namespace,
    resourceStatusLabel(resource),
    resource.raw.spec?.nodeName,
    nodeInternalIp(resource),
    resource.raw.spec?.clusterIP,
    servicePorts(resource),
    age(resource.created),
    ...Object.entries(resource.labels).map(([key, value]) => `${key}=${value}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function resourceFilterMatches(resource, filter) {
  if (filter.field === "age") return compareAgeFilter(resource, filter);

  const value = resourceFilterValue(resource, filter.field);
  if (value === undefined) return labelFilterMatches(resource, filter);
  return compareTextFilter(String(value).toLowerCase(), filter);
}

function resourceFilterValue(resource, field) {
  const fields = {
    name: resource.name,
    kind: resource.kind,
    type: [resource.type.replace(/s$/, ""), resource.raw.spec?.type, resource.raw.type].filter(Boolean).join(" "),
    resource: resource.type.replace(/s$/, ""),
    namespace: resource.namespace || "cluster",
    ns: resource.namespace || "cluster",
    status: resourceStatusLabel(resource),
    node: resource.raw.spec?.nodeName || nodeInternalIp(resource),
    ready: resource.type === "pods" ? podReady(resource) : resource.type === "deployments" ? deploymentReady(resource) : "",
    restarts: resource.type === "pods" ? podRestarts(resource) : "",
    port: resource.type === "services" ? servicePorts(resource) : "",
    ports: resource.type === "services" ? servicePorts(resource) : "",
    reason: resource.type === "events" ? resource.raw.reason || "" : "",
  };
  return fields[field];
}

function labelFilterMatches(resource, filter) {
  const labels = Object.fromEntries(Object.entries(resource.labels).map(([key, value]) => [key.toLowerCase(), String(value).toLowerCase()]));
  const labelField = filter.field.startsWith("label.") ? filter.field.slice(6) : filter.field.startsWith("label/") ? filter.field.slice(6) : filter.field;
  if (filter.field === "label" || filter.field === "labels") {
    return Object.entries(labels).some(([key, value]) => compareTextFilter(`${key}=${value}`, filter) || compareTextFilter(value, filter));
  }
  if (!(labelField in labels)) return false;
  return compareTextFilter(labels[labelField], filter);
}

function compareTextFilter(actual, filter) {
  const value = filter.value;
  if (filter.op === "!=") return !actual.includes(value);
  if (filter.op === ":" || filter.op === "=") return actual.includes(value);
  const left = Number.parseFloat(actual);
  const right = Number.parseFloat(value);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (filter.op === ">") return left > right;
  if (filter.op === "<") return left < right;
  if (filter.op === ">=") return left >= right;
  if (filter.op === "<=") return left <= right;
  return false;
}

function compareAgeFilter(resource, filter) {
  const expected = durationMs(filter.value);
  if (!Number.isFinite(expected)) return false;
  const actual = ageMs(resource.created);
  if (filter.op === "!=") return actual !== expected;
  if (filter.op === ":" || filter.op === "=") return actual >= expected * 0.8 && actual <= expected * 1.2;
  if (filter.op === ">") return actual > expected;
  if (filter.op === "<") return actual < expected;
  if (filter.op === ">=") return actual >= expected;
  if (filter.op === "<=") return actual <= expected;
  return false;
}

function durationMs(value) {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)?$/);
  if (!match) return Number.NaN;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2] || "ms";
  const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return amount * multipliers[unit];
}

function resourceStatusLabel(resource) {
  if (resource.type === "pods") return podStatus(resource).label;
  if (resource.type === "nodes") return nodeStatus(resource).label;
  if (resource.type === "events") return eventStatus(resource).label;
  if (resource.type === "deployments") return deploymentReady(resource);
  return "active";
}

function chartFilterApplies() {
  return Boolean(state.chartFilter && views[state.view].kind === "overview");
}

function chartFilterMatches(resource) {
  if (!chartFilterApplies()) return true;
  if (state.chartFilter.kind === "resource") return resource.type === state.chartFilter.value;
  if (state.chartFilter.kind === "podStatus") return resource.type === "pods" && podStatus(resource).tone === state.chartFilter.value;
  if (state.chartFilter.kind === "request") return resource.type === "pods" && podHasRequest(resource, state.chartFilter.value);
  if (state.chartFilter.kind === "allocatable") return resource.type === "nodes" && nodeHasAllocatable(resource, state.chartFilter.value);
  return true;
}

function podHasRequest(resource, field) {
  const containers = resource.raw.spec?.containers || [];
  return containers.some((container) => resourceQuantity(container.resources?.requests?.[field], field) > 0);
}

function nodeHasAllocatable(resource, field) {
  return resourceQuantity(resource.raw.status?.allocatable?.[field], field) > 0;
}

function resourceQuantity(value, field) {
  return field === "memory" ? parseMemoryQuantity(value) : parseCpuQuantity(value);
}

function renderDetails() {
  const resource = allResources().find((item) => item.key === state.selectedKey);
  if (!resource) {
    selectors.detailsPanel.innerHTML = `
      <div class="empty-state">
        <h3>Select a resource</h3>
        <p>Details, labels, conditions, and available kubectl actions appear here.</p>
      </div>`;
    return;
  }

  const labels = Object.entries(resource.labels);
  selectors.detailsPanel.innerHTML = `
    <div class="detail-head">
      <span class="subtle">${escapeHtml(resource.kind)}${resource.namespace ? ` in ${escapeHtml(resource.namespace)}` : ""}</span>
      <h3>${escapeHtml(resource.name)}</h3>
      ${overviewStatus(resource)}
    </div>
    <div class="actions">
      ${actionsFor(resource)
        .map((action) => `<button type="button" data-action="${action.id}">${action.label}</button>`)
        .join("")}
    </div>
    <div class="kv">
      <div class="kv-row"><span>Namespace</span><strong>${escapeHtml(resource.namespace || "cluster")}</strong></div>
      <div class="kv-row"><span>Created</span><strong>${escapeHtml(age(resource.created))}</strong></div>
      <div class="kv-row"><span>API</span><strong>${escapeHtml(resource.raw.apiVersion || "-")}</strong></div>
    </div>
    <h4 class="section-title">Labels</h4>
    <div class="pill-list">
      ${labels.length ? labels.map(([key, value]) => `<span class="pill">${escapeHtml(key)}=${escapeHtml(value)}</span>`).join("") : `<span class="subtle">No labels</span>`}
    </div>
    <h4 class="section-title">Status summary</h4>
    ${statusSummary(resource)}`;

  selectors.detailsPanel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = actionsFor(resource).find((item) => item.id === button.dataset.action);
      if (action.terminal) {
        openShell(resource);
        return;
      }
      if (action.logs) {
        openLogs(resource);
        return;
      }
      if (action.describe) {
        openDescribe(resource);
        return;
      }
      if (action.edit) {
        openEdit(resource);
        return;
      }
      runResourceAction(action, resource);
    });
  });
}

function renderCommands() {
  const kubectl = kubectlBase();
  const recipes = [
    { label: "Collect dashboard data", command: `${kubectl} get pods,deployments,services,nodes,events -A -o json` },
    { label: "Collect all common namespaced objects", command: `${kubectl} get all,events -A -o json` },
    { label: "Watch pods in all namespaces", command: `${kubectl} get pods -A --watch`, stream: true },
    { label: "Find unhealthy pods", command: `${kubectl} get pods -A --field-selector=status.phase!=Running` },
    { label: "Top pods", command: `${kubectl} top pods -A --containers` },
    { label: "Top nodes", command: `${kubectl} top nodes` },
    { label: "Apply a manifest", command: `${kubectl} apply -f ./manifest.yaml` },
    { label: "Switch context", command: "kubectl config use-context <context-name>" },
  ];

  selectors.resultCount.textContent = `${recipes.length} commands`;
  selectors.tableHead.innerHTML = "";
  selectors.tableBody.innerHTML = `
    <tr>
      <td>
        <div class="command-list">
          ${recipes
            .map(
              (recipe, index) => `
                <div class="command-item">
                  <strong>${escapeHtml(recipe.label)}</strong>
                  <code>${escapeHtml(recipe.command)}</code>
                  <div class="command-actions">
                    <button type="button" data-run="${index}">Run</button>
                    <button type="button" data-command="${escapeHtml(recipe.command)}">Copy</button>
                  </div>
                </div>`,
            )
            .join("")}
        </div>
      </td>
    </tr>`;

  selectors.tableBody.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => copyText(button.dataset.command));
  });
  selectors.tableBody.querySelectorAll("[data-run]").forEach((button) => {
    button.addEventListener("click", () => {
      const recipe = recipes[Number(button.dataset.run)];
      runCommand(recipe.label, recipe.command, recipe.stream);
    });
  });
}

function actionsFor(resource) {
  const kubectl = kubectlBase();
  const scoped = (verb, extra = "") =>
    `${kubectl} ${verb} ${kubectlKind(resource)} ${shellQuote(resource.name)}${resource.namespace ? ` -n ${shellQuote(resource.namespace)}` : ""}${extra}`;
  const base = [
    {
      id: "describe",
      label: "Describe",
      help: "Print full resource details with recent related events.",
      describe: true,
      command: () => scoped("describe"),
    },
    {
      id: "edit",
      label: "Edit",
      help: "Edit the live YAML and apply it back to the cluster.",
      edit: true,
      command: () => scoped("get", " -o yaml"),
    },
    {
      id: "yaml",
      label: "Get YAML",
      help: "Export the current live object as YAML.",
      command: () => scoped("get", " -o yaml"),
      formatter: formatYamlOutput,
    },
    {
      id: "delete",
      label: "Delete",
      help: "Deletes this resource. Review the name and namespace before running.",
      command: () => scoped("delete"),
      confirm: deleteConfirmation,
    },
  ];

  if (resource.type === "pods") {
    return [
      {
        id: "logs",
        label: "Logs",
        help: "Stream logs from this pod. Add -c <container> when the pod has multiple containers.",
        logs: true,
        command: () => scoped("logs", " --tail=200 -f"),
      },
      {
        id: "exec",
        label: "Shell",
        help: "Open an interactive shell in the first container. kd tries /bin/sh, BusyBox sh, ash, and bash.",
        terminal: true,
        command: () => scoped("exec -it", " -- /bin/sh"),
      },
      ...base,
    ];
  }

  if (resource.type === "deployments") {
    return [
      {
        id: "restart",
        label: "Restart",
        help: "Trigger a rolling restart for the deployment.",
        command: () => scoped("rollout restart"),
      },
      {
        id: "scale",
        label: "Scale",
        help: "Change the replica count. Replace the value before running.",
        command: () => scoped("scale", " --replicas=3"),
      },
      {
        id: "rollout",
        label: "Rollout",
        help: "Watch rollout status until it completes or fails.",
        command: () => scoped("rollout status"),
      },
      ...base,
    ];
  }

  if (resource.type === "services") {
    return [
      {
        id: "port-forward",
        label: "Forward",
        help: "Forward a local port to this service. Adjust the local port as needed.",
        command: () => scoped("port-forward", ` ${firstServicePort(resource)}:${firstServicePort(resource)}`),
      },
      {
        id: "endpoints",
        label: "Endpoints",
        help: "List endpoints associated with this service name.",
        command: () =>
          `${kubectl} get endpoints ${shellQuote(resource.name)}${resource.namespace ? ` -n ${shellQuote(resource.namespace)}` : ""} -o wide`,
        formatter: formatTableOutput,
      },
      ...base,
    ];
  }

  if (resource.type === "nodes") {
    return [
      {
        id: "cordon",
        label: "Cordon",
        help: "Mark this node unschedulable.",
        command: () => `${kubectl} cordon ${shellQuote(resource.name)}`,
      },
      {
        id: "drain",
        label: "Drain",
        help: "Evict workloads before maintenance. Review daemonset and local-data behavior.",
        command: () => `${kubectl} drain ${shellQuote(resource.name)} --ignore-daemonsets --delete-emptydir-data`,
      },
      {
        id: "uncordon",
        label: "Uncordon",
        help: "Allow scheduling on this node again.",
        command: () => `${kubectl} uncordon ${shellQuote(resource.name)}`,
      },
      ...base,
    ];
  }

  return base;
}

function kubectlBase() {
  return state.context ? `kubectl --context ${shellQuote(state.context)}` : "kubectl";
}

function showCommand(title, help, command) {
  selectors.dialogTitle.textContent = title;
  selectors.dialogHelp.textContent = help;
  selectors.commandOutput.value = command;
  selectors.commandDialog.showModal();
}

async function runResourceAction(action, resource) {
  const command = action.command(resource);
  if (action.confirm && !(await action.confirm(resource, command))) {
    return;
  }
  if (!state.apiAvailable) {
    showCommand(action.label, "Run kd to execute this action in the browser.", command);
    return;
  }
  if (command.includes("<") || command.includes(">")) {
    showCommand(action.label, "Replace placeholders before running this action.", command);
    return;
  }
  runCommand(action.label, command, Boolean(action.stream), { showCommand: false, formatter: action.formatter });
}

function deleteConfirmation(resource) {
  selectors.deleteTitle.textContent = `Delete ${resource.kind}`;
  selectors.deleteStatus.textContent = "This action runs kubectl delete and can remove live cluster resources.";
  selectors.deleteName.textContent = resource.name;
  selectors.deleteNamespace.textContent = resource.namespace || "cluster";
  selectors.deleteContext.textContent = state.context || "current context";
  selectors.deleteConfirmName.value = "";
  selectors.confirmDelete.disabled = true;
  selectors.confirmDelete.textContent = "Delete";

  return new Promise((resolve) => {
    state.deleteConfirmation = { expected: resource.name, resolve };
    selectors.deleteDialog.showModal();
    selectors.deleteConfirmName.focus();
  });
}

function updateDeleteConfirmation() {
  const expected = state.deleteConfirmation?.expected || "";
  const matches = selectors.deleteConfirmName.value === expected;
  selectors.confirmDelete.disabled = !matches;
}

function closeDeleteConfirmation(confirmed) {
  const pending = state.deleteConfirmation;
  if (!pending) return;
  const matches = selectors.deleteConfirmName.value === pending.expected;
  state.deleteConfirmation = null;
  if (selectors.deleteDialog.open) selectors.deleteDialog.close();
  pending.resolve(Boolean(confirmed && matches));
}

async function runCommand(title, command, stream = false, options = {}) {
  if (!state.apiAvailable) {
    showCommand(title, "Run kd to execute commands in the browser, or copy this command.", command);
    return;
  }

  if (command.includes("<") || command.includes(">")) {
    showCommand(title, "Replace placeholders before running this command.", command);
    return;
  }

  closeRun();
  selectors.runTitle.textContent = title;
  selectors.runStatus.textContent = options.showCommand === false ? "Running" : command;
  selectors.runOutput.textContent = options.showCommand === false ? "" : `$ ${command}\n\n`;
  selectors.runDialog.showModal();
  selectors.runOutput.focus();

  if (stream) {
    runStreamingCommand(command);
    return;
  }

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const data = await response.json();
    const output = data.output || "";
    appendOutput(selectors.runOutput, options.formatter ? options.formatter(output) : output);
    selectors.runStatus.textContent = data.exitCode === 0 ? "Completed" : `Exited ${data.exitCode}`;
  } catch (error) {
    appendOutput(selectors.runOutput, error.message);
    selectors.runStatus.textContent = "Failed";
  }
}


function formatYamlOutput(output) {
  return output.trim() ? output : "No YAML returned.\n";
}

function formatTableOutput(output) {
  const text = output.trimEnd();
  return text ? `${text}\n` : "No rows returned.\n";
}

function runStreamingCommand(command) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ command });
  state.runSocket = new WebSocket(`${protocol}//${location.host}/api/run-stream?${params.toString()}`);

  state.runSocket.addEventListener("open", () => {
    selectors.runStatus.textContent = "Running";
  });

  state.runSocket.addEventListener("message", (event) => {
    appendOutput(selectors.runOutput, String(event.data));
  });

  state.runSocket.addEventListener("close", () => {
    selectors.runStatus.textContent = "Stopped";
    state.runSocket = null;
  });

  state.runSocket.addEventListener("error", () => {
    selectors.runStatus.textContent = "Failed";
  });
}

function stopRun() {
  if (state.runSocket) {
    state.runSocket.close();
    state.runSocket = null;
  }
}

function closeRun() {
  stopRun();
  if (selectors.runDialog.open) {
    selectors.runDialog.close();
  }
}

function openShell(resource) {
  if (!state.apiAvailable) {
    showCommand("Shell", "Run kd to use the browser shell, or copy this command.", actionsFor(resource).find((action) => action.id === "exec").command(resource));
    return;
  }

  closeShell();
  selectors.terminalOutput.textContent = "";
  selectors.shellTitle.textContent = `Shell: ${resource.name}`;
  selectors.shellStatus.textContent = `${resource.namespace || "default"} · ${state.context || "current context"}`;
  selectors.shellDialog.showModal();
  selectors.terminalOutput.focus();

  const container = resource.raw.spec?.containers?.[0]?.name || "";
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({
    pod: resource.name,
    namespace: resource.namespace || "default",
    context: state.context || "",
    container,
  });
  state.shellSocket = new WebSocket(`${protocol}//${location.host}/api/shell?${params.toString()}`);

  state.shellSocket.addEventListener("open", () => {
    selectors.shellStatus.textContent = `Finding a shell in ${container || "first container"}`;
  });

  state.shellSocket.addEventListener("message", (event) => {
    const text = String(event.data);
    if (text.startsWith("Connected shell")) {
      selectors.shellStatus.textContent = text.split(":", 1)[0];
    }
    appendTerminalOutput(text);
  });

  state.shellSocket.addEventListener("close", () => {
    selectors.shellStatus.textContent = "Disconnected";
  });

  state.shellSocket.addEventListener("error", () => {
    selectors.shellStatus.textContent = "Shell connection failed";
  });
}

function closeShell() {
  if (state.shellSocket) {
    state.shellSocket.close();
    state.shellSocket = null;
  }
  if (selectors.shellDialog.open) {
    selectors.shellDialog.close();
  }
}

function openLogs(resource) {
  if (!state.apiAvailable) {
    showCommand("Logs", "Run kd to stream logs in the browser, or copy this command.", actionsFor(resource).find((action) => action.id === "logs").command(resource));
    return;
  }

  closeLogs();
  state.logsResource = resource;
  selectors.logsOutput.textContent = "";
  selectors.logsTitle.textContent = `Logs: ${resource.name}`;
  selectors.logsStatus.textContent = `${resource.namespace || "default"} · ${state.context || "current context"}`;
  selectors.logsDialog.showModal();
  selectors.logsOutput.focus();
  connectLogs(resource);
}

function connectLogs(resource) {
  if (state.logsSocket) {
    state.logsSocket.close();
    state.logsSocket = null;
  }

  const container = resource.raw.spec?.containers?.[0]?.name || "";
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({
    pod: resource.name,
    namespace: resource.namespace || "default",
    context: state.context || "",
    container,
    tail: "200",
  });

  selectors.logsStatus.textContent = `Connecting to ${container || "first container"}`;
  state.logsSocket = new WebSocket(`${protocol}//${location.host}/api/logs?${params.toString()}`);

  state.logsSocket.addEventListener("open", () => {
    selectors.logsStatus.textContent = `Streaming ${container || "first container"}`;
  });

  state.logsSocket.addEventListener("message", (event) => {
    appendOutput(selectors.logsOutput, String(event.data));
  });

  state.logsSocket.addEventListener("close", () => {
    selectors.logsStatus.textContent = "Disconnected";
  });

  state.logsSocket.addEventListener("error", () => {
    selectors.logsStatus.textContent = "Log stream failed";
  });
}

function closeLogs() {
  if (state.logsSocket) {
    state.logsSocket.close();
    state.logsSocket = null;
  }
  if (selectors.logsDialog.open) {
    selectors.logsDialog.close();
  }
}

function openDescribe(resource) {
  if (!state.apiAvailable) {
    showCommand("Describe", "Run kd to view describe output in the browser, or copy this command.", actionsFor(resource).find((action) => action.id === "describe").command(resource));
    return;
  }

  state.describeResource = resource;
  selectors.describeTitle.textContent = `Describe: ${resource.name}`;
  selectors.describeOutput.textContent = "";
  selectors.describeDialog.showModal();
  selectors.describeOutput.focus();
  loadDescribe(resource);
}

async function loadDescribe(resource) {
  selectors.describeStatus.textContent = "Loading";
  const params = new URLSearchParams({
    context: state.context || "",
    kind: kubectlKind(resource),
    name: resource.name,
    namespace: resource.namespace || "",
  });

  try {
    const response = await fetch(`/api/describe?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "kubectl describe failed.");
    selectors.describeOutput.textContent = data.description || "";
    selectors.describeStatus.textContent = `${resource.namespace || "cluster"} · ${state.context || "current context"}`;
  } catch (error) {
    selectors.describeOutput.textContent = error.message;
    selectors.describeStatus.textContent = "Describe failed";
  }
}

function closeDescribe() {
  if (selectors.describeDialog.open) {
    selectors.describeDialog.close();
  }
}

function openEdit(resource) {
  if (!state.apiAvailable) {
    showCommand("Edit", "Run kd to edit YAML in the browser, or copy this command.", actionsFor(resource).find((action) => action.id === "edit").command(resource));
    return;
  }

  state.editResource = resource;
  selectors.editTitle.textContent = `Edit: ${resource.name}`;
  selectors.editStatus.textContent = `${resource.namespace || "cluster"} · ${state.context || "current context"}`;
  selectors.editYaml.value = "";
  selectors.applyOutput.textContent = "";
  selectors.confirmApply.checked = false;
  selectors.applyYaml.disabled = true;
  selectors.editDialog.showModal();
  loadEditYaml(resource);
}

async function loadEditYaml(resource) {
  selectors.editStatus.textContent = "Loading YAML";
  selectors.applyOutput.textContent = "";
  const command = `${kubectlBase()} get ${kubectlKind(resource)} ${shellQuote(resource.name)}${resource.namespace ? ` -n ${shellQuote(resource.namespace)}` : ""} -o yaml`;

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.output || "Failed to load YAML.");
    selectors.editYaml.value = data.output || "";
    selectors.editStatus.textContent = "Loaded live YAML";
  } catch (error) {
    selectors.applyOutput.textContent = error.message;
    selectors.editStatus.textContent = "Load failed";
  }
}

async function applyYaml() {
  if (!state.editResource || !selectors.confirmApply.checked) return;
  selectors.applyYaml.disabled = true;
  selectors.editStatus.textContent = "Applying";
  selectors.applyOutput.textContent = "";

  try {
    const response = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: state.context || "",
        manifest: selectors.editYaml.value,
      }),
    });
    const data = await response.json();
    selectors.applyOutput.textContent = data.output || "";
    if (!response.ok) throw new Error(data.output || "Apply failed.");
    selectors.editStatus.textContent = "Applied";
    selectors.confirmApply.checked = false;
    await loadResources();
  } catch (error) {
    selectors.editStatus.textContent = "Apply failed";
    if (!selectors.applyOutput.textContent) selectors.applyOutput.textContent = error.message;
  } finally {
    selectors.applyYaml.disabled = !selectors.confirmApply.checked;
  }
}

function closeEdit() {
  state.editResource = null;
  if (selectors.editDialog.open) {
    selectors.editDialog.close();
  }
}

function handleTerminalKeydown(event) {
  if (!state.shellSocket || state.shellSocket.readyState !== WebSocket.OPEN) return;
  if (event.metaKey || event.altKey) return;

  if (event.ctrlKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    sendShellInput("\u0003");
    return;
  }

  const keys = {
    Enter: "\r",
    Backspace: "\u007f",
    Tab: "\t",
    ArrowUp: "\u001b[A",
    ArrowDown: "\u001b[B",
    ArrowRight: "\u001b[C",
    ArrowLeft: "\u001b[D",
    Escape: "\u001b",
  };

  if (keys[event.key]) {
    event.preventDefault();
    sendShellInput(keys[event.key]);
    return;
  }

  if (event.key.length === 1) {
    event.preventDefault();
    sendShellInput(event.key);
  }
}

function sendShellInput(value) {
  if (state.shellSocket && state.shellSocket.readyState === WebSocket.OPEN) {
    state.shellSocket.send(value);
  }
}

function appendTerminalOutput(value) {
  appendOutput(selectors.terminalOutput, value);
}

function appendOutput(element, value) {
  const cleaned = value
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\u0007]*(\u0007|\x1b\\)/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  element.textContent += cleaned;
  const maxLength = 120000;
  if (element.textContent.length > maxLength) {
    element.textContent = element.textContent.slice(-maxLength);
  }
  element.scrollTop = element.scrollHeight;
}

function allResources() {
  return Object.values(state.resources).flat();
}

function overviewStatus(resource) {
  if (resource.type === "pods") return statusBadge(podStatus(resource));
  if (resource.type === "nodes") return statusBadge(nodeStatus(resource));
  if (resource.type === "events") return statusBadge(eventStatus(resource));
  if (resource.type === "deployments") {
    const ready = resource.raw.status?.readyReplicas || 0;
    const desired = resource.raw.spec?.replicas || 0;
    return statusBadge({ label: `${ready}/${desired} ready`, tone: ready === desired ? "good" : "warn" });
  }
  return statusBadge({ label: "Active", tone: "good" });
}

function podStatus(resource) {
  const phase = resource.raw.status?.phase || "Unknown";
  const waiting = (resource.raw.status?.containerStatuses || []).find((status) => status.state?.waiting);
  if (waiting) return { label: waiting.state.waiting.reason || "Waiting", tone: "warn" };
  if (phase === "Running" || phase === "Succeeded") return { label: phase, tone: "good" };
  if (phase === "Pending") return { label: phase, tone: "warn" };
  return { label: phase, tone: "bad" };
}

function nodeStatus(resource) {
  const ready = (resource.raw.status?.conditions || []).find((condition) => condition.type === "Ready");
  return ready?.status === "True" ? { label: "Ready", tone: "good" } : { label: "NotReady", tone: "bad" };
}

function eventStatus(resource) {
  return resource.raw.type === "Warning"
    ? { label: "Warning", tone: "warn" }
    : { label: resource.raw.type || "Normal", tone: "good" };
}

function statusBadge(status) {
  return `<span class="status"><span class="dot ${status.tone}"></span>${escapeHtml(status.label)}</span>`;
}

function podReady(resource) {
  const statuses = resource.raw.status?.containerStatuses || [];
  if (!statuses.length) return "0/0";
  return `${statuses.filter((status) => status.ready).length}/${statuses.length}`;
}

function podRestarts(resource) {
  return (resource.raw.status?.containerStatuses || []).reduce((total, status) => total + (status.restartCount || 0), 0);
}

function deploymentReady(resource) {
  return `${resource.raw.status?.readyReplicas || 0}/${resource.raw.spec?.replicas || 0}`;
}

function servicePorts(resource) {
  const ports = resource.raw.spec?.ports || [];
  return ports.length ? ports.map((port) => `${port.port}/${port.protocol || "TCP"}`).join(", ") : "-";
}

function firstServicePort(resource) {
  return resource.raw.spec?.ports?.[0]?.port || 8080;
}

function nodeInternalIp(resource) {
  const address = (resource.raw.status?.addresses || []).find((item) => item.type === "InternalIP");
  return escapeHtml(address?.address || "-");
}

function eventObject(resource) {
  const object = resource.raw.involvedObject || {};
  return escapeHtml(object.kind && object.name ? `${object.kind}/${object.name}` : "-");
}

function summarize(resource) {
  if (resource.type === "pods") {
    return {
      phase: resource.raw.status?.phase,
      podIP: resource.raw.status?.podIP,
      node: resource.raw.spec?.nodeName,
      containers: (resource.raw.spec?.containers || []).map((container) => container.name),
    };
  }
  if (resource.type === "deployments") {
    return { spec: resource.raw.spec, status: resource.raw.status };
  }
  if (resource.type === "services") {
    return { type: resource.raw.spec?.type, clusterIP: resource.raw.spec?.clusterIP, ports: resource.raw.spec?.ports };
  }
  if (resource.type === "nodes") {
    return { nodeInfo: resource.raw.status?.nodeInfo, conditions: resource.raw.status?.conditions };
  }
  if (resource.type === "events") {
    return {
      type: resource.raw.type,
      reason: resource.raw.reason,
      object: resource.raw.involvedObject,
      message: resource.raw.message,
    };
  }
  return resource.raw;
}

function statusSummary(resource) {
  const summary = summarize(resource);
  if (resource.type === "pods") return podStatusSummary(resource, summary);
  if (resource.type === "deployments") return deploymentStatusSummary(resource, summary);
  if (resource.type === "services") return serviceStatusSummary(summary);
  if (resource.type === "nodes") return nodeStatusSummary(summary);
  if (resource.type === "events") return eventStatusSummary(summary);
  return `<pre class="code-line expanded">${escapeHtml(JSON.stringify(summary, null, 2))}</pre>`;
}

function summaryRows(rows) {
  return `
    <div class="summary-grid">
      ${rows
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([label, value]) => `
          <div class="summary-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(String(value))}</strong>
          </div>`)
        .join("")}
    </div>`;
}

function podStatusSummary(resource, summary) {
  const containerStatuses = resource.raw.status?.containerStatuses || [];
  const conditions = resource.raw.status?.conditions || [];
  const containers = containerStatuses.length
    ? containerStatuses.map((status) => {
        const state = Object.keys(status.state || {})[0] || "unknown";
        return `${status.name}: ${state}${status.ready ? " ready" : " not ready"}${status.restartCount ? `, ${status.restartCount} restarts` : ""}`;
      })
    : summary.containers.map((name) => `${name}: status pending`);
  const readyCondition = conditions.find((condition) => condition.type === "Ready");

  return `
    ${summaryRows([
      ["Phase", summary.phase || "-"],
      ["Pod IP", summary.podIP || "-"],
      ["Node", summary.node || "-"],
      ["Ready", readyCondition?.status || "-"],
    ])}
    ${summaryList("Containers", containers)}
    ${summaryList(
      "Conditions",
      conditions.map(formatCondition),
    )}`;
}

function deploymentStatusSummary(resource, summary) {
  const spec = summary.spec || {};
  const status = summary.status || {};
  const conditions = status.conditions || [];
  return `
    ${summaryRows([
      ["Replicas", `${status.readyReplicas || 0}/${spec.replicas || 0} ready`],
      ["Updated", status.updatedReplicas || 0],
      ["Available", status.availableReplicas || 0],
      ["Unavailable", status.unavailableReplicas || 0],
    ])}
    ${summaryList(
      "Conditions",
      conditions.map(formatCondition),
    )}`;
}

function serviceStatusSummary(summary) {
  const ports = summary.ports || [];
  return `
    ${summaryRows([
      ["Type", summary.type || "-"],
      ["Cluster IP", summary.clusterIP || "-"],
    ])}
    ${summaryList(
      "Ports",
      ports.map((port) => `${port.name ? `${port.name}: ` : ""}${port.port}${port.targetPort ? ` -> ${port.targetPort}` : ""}/${port.protocol || "TCP"}`),
    )}`;
}

function nodeStatusSummary(summary) {
  const info = summary.nodeInfo || {};
  const conditions = summary.conditions || [];
  return `
    ${summaryRows([
      ["OS", info.osImage || "-"],
      ["Kernel", info.kernelVersion || "-"],
      ["Kubelet", info.kubeletVersion || "-"],
      ["Runtime", formatRuntime(info.containerRuntimeVersion)],
    ])}
    ${summaryList(
      "Conditions",
      conditions.map(formatCondition),
    )}`;
}

function eventStatusSummary(summary) {
  return `
    ${summaryRows([
      ["Type", summary.type || "-"],
      ["Reason", summary.reason || "-"],
      ["Object", summary.object?.kind && summary.object?.name ? `${summary.object.kind}/${summary.object.name}` : "-"],
    ])}
    ${summary.message ? `<p class="summary-message">${escapeHtml(summary.message)}</p>` : ""}`;
}

function summaryList(title, items) {
  const visible = items.filter(Boolean).map((item) => (typeof item === "string" ? { label: item } : item));
  if (!visible.length) return "";
  return `
    <div class="summary-list">
      <h5>${escapeHtml(title)}</h5>
      ${visible.map(summaryItem).join("")}
    </div>`;
}

function summaryItem(item) {
  const tone = item.tone ? ` ${item.tone}` : "";
  return `
    <div class="summary-item${tone}">
      <strong>${escapeHtml(item.label || "-")}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>`;
}

function formatCondition(condition) {
  const type = condition.type || "Condition";
  const status = condition.status === true ? "True" : condition.status === false ? "False" : condition.status || "Unknown";
  const isTrue = status === "True";
  const reason = condition.reason && condition.reason !== type ? condition.reason : "";
  const detail = condition.message || reason || "";

  const known = {
    Ready: isTrue ? ["Ready", "good"] : ["Not ready", "bad"],
    ContainersReady: isTrue ? ["Containers ready", "good"] : ["Containers not ready", "bad"],
    PodScheduled: isTrue ? ["Scheduled", "good"] : ["Not scheduled", "warn"],
    Initialized: isTrue ? ["Initialized", "good"] : ["Initializing", "warn"],
    NetworkUnavailable: isTrue ? ["Network unavailable", "bad"] : ["Network available", "good"],
    MemoryPressure: isTrue ? ["Memory pressure", "bad"] : ["Memory pressure clear", "good"],
    DiskPressure: isTrue ? ["Disk pressure", "bad"] : ["Disk pressure clear", "good"],
    PIDPressure: isTrue ? ["PID pressure", "bad"] : ["PID pressure clear", "good"],
  };

  const [label, tone] = known[type] || [`${humanizeIdentifier(type)}: ${humanizeConditionStatus(status)}`, status === "True" ? "good" : "muted"];
  return { label, tone, detail };
}

function humanizeIdentifier(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function humanizeConditionStatus(status) {
  if (status === "True") return "yes";
  if (status === "False") return "no";
  return "unknown";
}

function formatRuntime(value) {
  if (!value) return "-";
  return String(value).replace("://", " ");
}

function kubectlKind(resource) {
  return {
    pods: "pod",
    deployments: "deployment",
    services: "service",
    nodes: "node",
    events: "event",
  }[resource.type];
}

function age(timestamp) {
  if (!timestamp) return "-";
  const diff = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diff)) return "-";
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9._:/=-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

init();
