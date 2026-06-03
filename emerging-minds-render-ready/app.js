const state = {
  facets: null,
  page: 1,
  pageSize: 24,
  query: "",
  sort: "title",
  view: "cards",
  selected: {
    group: new Set(),
    type: new Set(),
    year: new Set(),
  },
};

const $ = (selector) => document.querySelector(selector);

const els = {
  summary: $("#summary"),
  groupFilters: $("#groupFilters"),
  typeFilters: $("#typeFilters"),
  yearFilters: $("#yearFilters"),
  searchInput: $("#searchInput"),
  sortSelect: $("#sortSelect"),
  resultCount: $("#resultCount"),
  activeFilters: $("#activeFilters"),
  results: $("#results"),
  prevPage: $("#prevPage"),
  nextPage: $("#nextPage"),
  pageInfo: $("#pageInfo"),
  clearFilters: $("#clearFilters"),
  cardView: $("#cardView"),
  tableView: $("#tableView"),
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-AU").format(value);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function debounce(fn, delay = 220) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function paramsForRequest() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  params.set("sort", state.sort);
  params.set("page", state.page);
  params.set("page_size", state.pageSize);
  for (const [field, values] of Object.entries(state.selected)) {
    for (const value of values) params.append(field, value);
  }
  return params;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function renderSummary() {
  const groupCounts = Object.fromEntries(state.facets.groups.map((item) => [item.value, item.count]));
  const metrics = [
    ["Total records", state.facets.total],
    ["Resources", groupCounts.Resource || 0],
    ["Podcasts", groupCounts.Podcast || 0],
    ["Courses", groupCounts.Course || 0],
    ["Toolkits", groupCounts.Toolkit || 0],
  ];
  els.summary.innerHTML = metrics
    .map(([label, count]) => `<article class="metric"><b>${formatNumber(count)}</b><span>${label}</span></article>`)
    .join("");
}

function renderChecks(container, field, items) {
  container.innerHTML = items
    .map((item) => {
      const id = `${field}-${item.value}`.replace(/[^a-z0-9]+/gi, "-");
      const checked = state.selected[field].has(item.value) ? "checked" : "";
      return `
        <label class="check-item" for="${id}">
          <input id="${id}" type="checkbox" data-field="${field}" value="${escapeHtml(item.value)}" ${checked}>
          <span>${escapeHtml(item.value)}</span>
          <em>${formatNumber(item.count)}</em>
        </label>`;
    })
    .join("");
}

function renderFacets() {
  renderChecks(els.groupFilters, "group", state.facets.groups);
  renderChecks(els.typeFilters, "type", state.facets.types);
  renderChecks(els.yearFilters, "year", state.facets.years);
}

function renderActiveFilters() {
  const chips = [];
  if (state.query) chips.push(`Search: ${state.query}`);
  for (const [field, values] of Object.entries(state.selected)) {
    for (const value of values) chips.push(`${field}: ${value}`);
  }
  els.activeFilters.innerHTML = chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("");
}

function cardTemplate(item) {
  return `
    <article class="card">
      <div class="meta">
        <span class="tag group">${escapeHtml(item.catalogue_group)}</span>
        <span class="tag">${escapeHtml(item.resource_type)}</span>
        <span class="tag">${escapeHtml(item.year || "No date")}</span>
      </div>
      <h2><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.synopsis)}</p>
      <div class="date">Updated ${escapeHtml(item.last_modified_label || "unknown")}</div>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open resource</a>
    </article>`;
}

function tableTemplate(items) {
  return `
    <div class="table">
      <div class="row head">
        <div>Resource</div>
        <div>Collection</div>
        <div>Type</div>
        <div>Updated</div>
      </div>
      ${items
        .map(
          (item) => `
          <div class="row">
            <div class="resource-title">
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
              <p>${escapeHtml(item.synopsis)}</p>
            </div>
            <div>${escapeHtml(item.catalogue_group)}</div>
            <div>${escapeHtml(item.resource_type)}</div>
            <div>${escapeHtml(item.last_modified_label || "unknown")}</div>
          </div>`
        )
        .join("")}
    </div>`;
}

function renderResults(data) {
  const first = data.total === 0 ? 0 : (data.page - 1) * data.page_size + 1;
  const last = Math.min(data.total, data.page * data.page_size);
  els.resultCount.textContent = data.total
    ? `Showing ${formatNumber(first)}-${formatNumber(last)} of ${formatNumber(data.total)}`
    : "No matching resources";

  if (!data.items.length) {
    els.results.className = "cards";
    els.results.innerHTML = `<div class="empty">No resources match the current search and filters.</div>`;
  } else if (state.view === "table") {
    els.results.className = "";
    els.results.innerHTML = tableTemplate(data.items);
  } else {
    els.results.className = "cards";
    els.results.innerHTML = data.items.map(cardTemplate).join("");
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  els.pageInfo.textContent = `Page ${data.page} of ${totalPages}`;
  els.prevPage.disabled = data.page <= 1;
  els.nextPage.disabled = data.page >= totalPages;
}

async function loadResults() {
  renderActiveFilters();
  const data = await fetchJson(`/api/resources?${paramsForRequest().toString()}`);
  renderResults(data);
}

function bindEvents() {
  const updateSearch = debounce(() => {
    state.query = els.searchInput.value.trim();
    state.page = 1;
    loadResults();
  });

  els.searchInput.addEventListener("input", updateSearch);
  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    state.page = 1;
    loadResults();
  });

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!input.matches("input[type='checkbox'][data-field]")) return;
    const set = state.selected[input.dataset.field];
    if (input.checked) set.add(input.value);
    else set.delete(input.value);
    state.page = 1;
    loadResults();
  });

  els.clearFilters.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    for (const set of Object.values(state.selected)) set.clear();
    document.querySelectorAll("input[type='checkbox'][data-field]").forEach((input) => {
      input.checked = false;
    });
    state.page = 1;
    loadResults();
  });

  els.prevPage.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    loadResults();
  });

  els.nextPage.addEventListener("click", () => {
    state.page += 1;
    loadResults();
  });

  els.cardView.addEventListener("click", () => setView("cards"));
  els.tableView.addEventListener("click", () => setView("table"));
}

function setView(view) {
  state.view = view;
  els.cardView.classList.toggle("active", view === "cards");
  els.tableView.classList.toggle("active", view === "table");
  loadResults();
}

async function init() {
  try {
    state.facets = await fetchJson("/api/facets");
    renderSummary();
    renderFacets();
    bindEvents();
    await loadResults();
  } catch (error) {
    els.resultCount.textContent = "Could not load the resource database.";
    els.results.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

init();
