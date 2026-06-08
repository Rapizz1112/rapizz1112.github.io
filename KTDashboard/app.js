const state = {
  rows: [],
  filtered: [],
  grouped: [],
  page: 1,
  pageSize: 20,
  sortBy: "spend",
  sortDir: "desc",
  selectedKey: null,
  lineMetrics: loadLineMetrics(),
  trendMode: "month",
  insightMode: "roas",
  savedFiles: [],
};

const columnAliases = {
  date: ["Reporting starts", "Date", "Publish Date"],
  endDate: ["Reporting ends"],
  adName: ["Ad name", "Post Name", "Content Name"],
  adSet: ["Ad set name", "Ad Set", "Campaign"],
  delivery: ["Ad delivery", "Delivery"],
  spend: ["Amount spent (THB)", "Spend (฿)", "Spend", "Spend (B)"],
  reach: ["Reach"],
  impressions: ["Impressions"],
  purchases: ["Purchases", "Purchases (Ads)"],
  value: ["FB Purchase Value", "Purchase Value", "Ads Revenue (฿)", "Total Revenue (฿)"],
  roas: ["Purchase ROAS (return on ad spend)", "Ads ROAS", "Real ROAS"],
  messages: ["Messaging conversations started", "Messages"],
  contacts: ["New messaging contacts"],
  results: ["Results"],
  cpr: ["Cost per results"],
  cpmessaging: ["Cost per messaging conversation started (THB)"],
  cpm: ["CPM"],
  objective: ["Result indicator", "Objective"],
};

const els = {
  file: document.querySelector("#csvFile"),
  fileTop: document.querySelector("#csvFileTop"),
  loadSample: document.querySelector("#loadSample"),
  loadSampleTop: document.querySelector("#loadSampleTop"),
  dateFrom: document.querySelector("#dateFrom"),
  dateTo: document.querySelector("#dateTo"),
  search: document.querySelector("#searchInput"),
  groupBy: document.querySelector("#groupBy"),
  delivery: document.querySelector("#deliveryFilter"),
  sortBy: document.querySelector("#sortBy"),
  exportCsv: document.querySelector("#exportCsv"),
  kpis: document.querySelector("#kpiGrid"),
  tableBody: document.querySelector("#tableBody"),
  rowCount: document.querySelector("#rowCount"),
  pageLabel: document.querySelector("#pageLabel"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  detail: document.querySelector("#detailContent"),
  insights: document.querySelector("#insights"),
  trendSubtitle: document.querySelector("#trendSubtitle"),
  chart: document.querySelector("#trendChart"),
  trendTabs: document.querySelectorAll("[data-trend-mode]"),
  insightTabs: document.querySelectorAll("[data-insight-mode]"),
  navItems: document.querySelectorAll("[data-view]"),
  viewPanels: document.querySelectorAll("[data-view-panel]"),
  overviewValue: document.querySelector("#overviewValue"),
  overviewValueNote: document.querySelector("#overviewValueNote"),
  overviewRoas: document.querySelector("#overviewRoas"),
  overviewSuper: document.querySelector("#overviewSuper"),
  valueDonut: document.querySelector("#valueDonut"),
  funnelBar: document.querySelector("#funnelBar"),
  monthlyBar: document.querySelector("#monthlyBar"),
  performanceDonut: document.querySelector("#performanceDonut"),
  fileList: document.querySelector("#fileList"),
  clearFiles: document.querySelector("#clearFiles"),
  emptyTemplate: document.querySelector("#emptyStateTemplate"),
};

const formatNumber = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const formatMoney = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const formatDecimal = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPercentNumber = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function openFilesDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("adsDashboardFiles", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("csvFiles")) db.createObjectStore("csvFiles", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withFileStore(mode, callback) {
  const db = await openFilesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("csvFiles", mode);
    const store = tx.objectStore("csvFiles");
    const result = callback(store);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getSavedFiles() {
  const db = await openFilesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("csvFiles", "readonly");
    const request = tx.objectStore("csvFiles").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.addedAt - b.addedAt));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveCsvFile(file, content) {
  const record = {
    id: `${file.name}-${file.size}-${file.lastModified || Date.now()}`,
    name: file.name,
    size: file.size,
    addedAt: Date.now(),
    content,
  };
  await withFileStore("readwrite", (store) => store.put(record));
}

async function deleteCsvFile(id) {
  await withFileStore("readwrite", (store) => store.delete(id));
}

async function clearCsvFiles() {
  await withFileStore("readwrite", (store) => store.clear());
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => value !== ""));
}

function findColumn(headers, key) {
  const aliases = columnAliases[key] || [key];
  return aliases.map((name) => headers.indexOf(name)).find((index) => index >= 0);
}

function toNumber(value) {
  if (value === undefined || value === null || value === "" || value === "-") return 0;
  const parsed = Number(String(value).replace(/,/g, "").replace(/[฿บาท]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRows(csvRows) {
  const headers = csvRows[0].map((header) => header.trim());
  const idx = Object.fromEntries(Object.keys(columnAliases).map((key) => [key, findColumn(headers, key)]));
  const hasMessagesColumn = idx.messages !== undefined;

  return csvRows.slice(1).map((row, index) => {
    const pick = (key) => (idx[key] === undefined ? "" : row[idx[key]] || "");
    const spend = toNumber(pick("spend"));
    const impressions = toNumber(pick("impressions"));
    const value = toNumber(pick("value"));
    const results = toNumber(pick("results"));
    const messages = hasMessagesColumn ? toNumber(pick("messages")) : results;
    const purchases = toNumber(pick("purchases"));
    const rawRoas = toNumber(pick("roas"));
    return {
      id: index + 1,
      date: pick("date"),
      displayDate: parseDateFromName(pick("adName")) || pick("date"),
      endDate: pick("endDate"),
      adName: pick("adName") || `Ad ${index + 1}`,
      adSet: pick("adSet") || "(ไม่ระบุ ad set)",
      delivery: pick("delivery") || "(ไม่ระบุ)",
      objective: pick("objective") || "",
      spend,
      reach: toNumber(pick("reach")),
      impressions,
      purchases,
      value,
      roas: rawRoas || (spend ? value / spend : 0),
      messages,
      contacts: toNumber(pick("contacts")),
      results,
      cpr: toNumber(pick("cpr")) || (results ? spend / results : 0),
      cpmessaging: toNumber(pick("cpmessaging")) || (messages ? spend / messages : 0),
      cpm: toNumber(pick("cpm")) || (impressions ? (spend / impressions) * 1000 : 0),
    };
  }).filter((row) => row.date || row.adName);
}

function aggregate(rows, groupBy) {
  const map = new Map();

  rows.forEach((row) => {
    const key = groupBy === "adset" ? row.adSet : groupBy === "month" ? row.date.slice(0, 7) || "(ไม่ระบุเดือน)" : row.adName;
    const displayDate = groupBy === "ad" ? row.displayDate : groupBy === "month" ? key : row.date;
    const current = map.get(key) || {
      key,
      name: key,
      date: displayDate,
      delivery: row.delivery,
      adSet: row.adSet,
      rows: 0,
      spend: 0,
      reach: 0,
      impressions: 0,
      messages: 0,
      contacts: 0,
      purchases: 0,
      value: 0,
      lineMessages: 0,
      linePurchases: 0,
      lineValue: 0,
      fbViews: 0,
      interactions: 0,
      results: 0,
      cprSpend: 0,
      cprResults: 0,
      msgCostSpend: 0,
      msgCostMessages: 0,
      lineKeys: new Set(),
    };

    current.rows += 1;
    if (groupBy !== "ad") current.date = row.date > current.date ? row.date : current.date;
    current.spend += row.spend;
    current.reach += row.reach;
    current.impressions += row.impressions;
    current.messages += row.messages;
    current.contacts += row.contacts;
    current.purchases += row.purchases;
    current.value += row.value;
    current.results += row.results;
    current.cprSpend += row.cpr ? row.cpr * row.results : row.spend;
    current.cprResults += row.results;
    current.msgCostSpend += row.cpmessaging ? row.cpmessaging * row.messages : row.spend;
    current.msgCostMessages += row.messages;
    if (!current.lineKeys.has(row.adName)) {
      const line = getLineMetrics(row.adName);
      current.lineMessages += line.messages;
      current.linePurchases += line.purchases;
      current.lineValue += line.value;
      current.fbViews += line.fbViews;
      current.interactions += line.interactions;
      current.lineKeys.add(row.adName);
    }
    if (!current.delivery.includes(row.delivery)) current.delivery = current.delivery === row.delivery ? current.delivery : "mixed";
    map.set(key, current);
  });

  return [...map.values()].map((item) => {
    const totalValue = item.value + item.lineValue;
    const totalRoas = item.spend ? totalValue / item.spend : 0;
    const fbRoas = item.spend ? item.value / item.spend : 0;
    const totalViews = item.fbViews;
    return {
      ...item,
      lineKeys: undefined,
      fbRoas,
      type: inferType(item.name),
      market: inferMarket(item.name, item.adSet),
      funnel: inferFunnel(item.name, item.adSet),
      product: inferProduct(item.name, item.adSet),
      month: monthLabel(item.date),
      totalValue,
      totalPurchases: item.purchases + item.linePurchases,
      totalMessages: item.messages + item.lineMessages,
      totalViews,
      engageRate: totalViews ? item.interactions / totalViews : 0,
      totalRoas,
      roas: totalRoas,
      conversionRate: item.messages ? item.purchases / item.messages : 0,
      costNewMsg: item.contacts ? item.spend / item.contacts : 0,
      cpm: item.impressions ? (item.spend / item.impressions) * 1000 : 0,
      cpr: item.cprResults ? item.cprSpend / item.cprResults : 0,
      cpmessaging: item.msgCostMessages ? item.msgCostSpend / item.msgCostMessages : 0,
    };
  });
}

function parseDateFromName(name) {
  const match = String(name || "").match(/\((\d{2})\/(\d{2})\/(\d{2})\)/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `20${year}-${month}-${day}`;
}

function inferType(name) {
  const text = String(name || "").toLowerCase();
  if (text.includes("album")) return "album";
  if (text.includes("ebook") || text.includes("e-book")) return "e-book";
  if (text.includes("reels") || text.includes("video") || text.includes("vdo")) return "video";
  return "1:1";
}

function inferMarket(name, adSet) {
  const text = `${name} ${adSet}`.toLowerCase();
  if (text.includes("ielts")) return "IELTS";
  if (text.includes("toefl")) return "TOEFL";
  return "";
}

function inferFunnel(name, adSet) {
  const text = `${name} ${adSet}`.toLowerCase();
  if (text.includes("retarget") || text.includes("remarket")) return "ปิดการขาย";
  if (text.includes("conv") || text.includes("sale") || text.includes("flash")) return "เร่งซื้อ";
  if (text.includes("lal") || text.includes("prospect")) return "สร้างคน";
  return "สร้างคน";
}

function inferProduct(name, adSet) {
  const text = `${name} ${adSet}`.toLowerCase();
  if (text.includes("ebook") || text.includes("e-book") || text.includes("หนังสือ")) return "หนังสือ";
  if (text.includes("course") || text.includes("คอร์ส") || text.includes("ielts")) return "คอร์ส";
  return "";
}

function monthLabel(date) {
  if (!date || date.length < 7) return "";
  const [year, month] = date.split("-");
  return `${month}/${year.slice(2)}`;
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  const delivery = els.delivery.value;
  const from = els.dateFrom.value;
  const to = els.dateTo.value;

  state.filtered = state.rows.filter((row) => {
    const haystack = `${row.adName} ${row.adSet} ${row.objective} ${row.delivery}`.toLowerCase();
    const matchQuery = !query || haystack.includes(query);
    const matchDelivery = delivery === "all" || row.delivery === delivery;
    const matchFrom = !from || row.date >= from;
    const matchTo = !to || row.date <= to;
    return matchQuery && matchDelivery && matchFrom && matchTo;
  });

  const grouped = aggregate(state.filtered, els.groupBy.value);
  state.grouped = sortRows(grouped);
  state.page = 1;
  renderAll();
}

function sortRows(rows) {
  const key = state.sortBy;
  const dir = state.sortDir === "asc" ? 1 : -1;
  const lowIsBetter = ["cpm", "cpr", "cpmessaging", "costNewMsg"].includes(key);
  return [...rows].sort((a, b) => {
    const stringKeys = ["name", "date", "delivery", "type", "market", "funnel", "product", "objective", "month"];
    const aValue = stringKeys.includes(key) ? String(a[key] || "") : Number(a[key] || 0);
    const bValue = stringKeys.includes(key) ? String(b[key] || "") : Number(b[key] || 0);
    const order = typeof aValue === "string" ? aValue.localeCompare(bValue, "th") : aValue - bValue;
    return order * (lowIsBetter ? 1 : dir);
  });
}

function totals(rows) {
  const total = rows.reduce((acc, row) => {
    acc.spend += row.spend;
    acc.reach += row.reach;
    acc.impressions += row.impressions;
    acc.messages += row.messages;
    acc.contacts += row.contacts;
    acc.purchases += row.purchases;
    acc.value += row.value;
    acc.lineMessages += row.lineMessages || 0;
    acc.linePurchases += row.linePurchases || 0;
    acc.lineValue += row.lineValue || 0;
    acc.results += row.results;
    return acc;
  }, { spend: 0, reach: 0, impressions: 0, messages: 0, contacts: 0, purchases: 0, value: 0, lineMessages: 0, linePurchases: 0, lineValue: 0, results: 0 });

  total.totalValue = total.value + total.lineValue;
  total.totalPurchases = total.purchases + total.linePurchases;
  total.totalMessages = total.messages + total.lineMessages;
  total.roas = total.spend ? total.totalValue / total.spend : 0;
  total.cpm = total.impressions ? (total.spend / total.impressions) * 1000 : 0;
  total.cpr = total.results ? total.spend / total.results : 0;
  return total;
}

function renderKpis() {
  const total = totals(state.grouped);
  const cards = [
    ["Spend", `฿${formatMoney.format(total.spend)}`, `${formatNumber.format(state.filtered.length)} rows`],
    ["Reach", formatNumber.format(total.reach), `CPM ฿${formatDecimal.format(total.cpm)}`],
    ["Messages", formatNumber.format(total.totalMessages), `FB ${formatNumber.format(total.messages)} / Line ${formatNumber.format(total.lineMessages)}`],
    ["Purchases", formatNumber.format(total.totalPurchases), `FB ${formatNumber.format(total.purchases)} / Line ${formatNumber.format(total.linePurchases)}`],
    ["Total Value", `฿${formatMoney.format(total.totalValue)}`, `FB ฿${formatMoney.format(total.value)} / Line ฿${formatMoney.format(total.lineValue)}`],
    ["Total ROAS", formatDecimal.format(total.roas), "คำนวณจาก FB Value + Line Value"],
  ];

  els.kpis.innerHTML = cards.map(([label, value, note]) => `
    <article class="kpi-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");
}

function renderTable() {
  if (!state.grouped.length) {
    els.tableBody.innerHTML = els.emptyTemplate.innerHTML;
    els.rowCount.textContent = state.rows.length ? "ไม่พบข้อมูลตาม filter" : "รอ import ข้อมูล";
    els.pageLabel.textContent = "1 / 1";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(state.grouped.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = state.grouped.slice(start, start + state.pageSize);

  els.rowCount.textContent = `ทั้งหมด ${formatNumber.format(state.grouped.length)} รายการ จาก ${formatNumber.format(state.filtered.length)} rows`;
  els.pageLabel.textContent = `${state.page} / ${totalPages}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;

  els.tableBody.innerHTML = pageRows.map((row) => `
    <tr data-key="${escapeAttr(row.key)}" class="${state.selectedKey === row.key ? "selected" : ""}">
      <td>
        <div class="name-cell">
          <span class="thumb">${initials(row.name)}</span>
          <div>${escapeHtml(row.name)}<small>${escapeHtml(row.adSet || "")}</small></div>
        </div>
      </td>
      <td>${escapeHtml(row.type || "-")}</td>
      <td>${escapeHtml(row.market || "-")}</td>
      <td>${escapeHtml(row.funnel || "-")}</td>
      <td>${escapeHtml(row.product || "-")}</td>
      <td>${escapeHtml(row.objective || "-")}</td>
      <td>${escapeHtml(row.month || "-")}</td>
      <td>${escapeHtml(row.date || "-")}</td>
      <td>฿${formatMoney.format(row.spend)}</td>
      <td>${formatNumber.format(row.reach)}</td>
      <td>${formatNumber.format(row.contacts)}</td>
      <td class="${row.costNewMsg && row.costNewMsg <= 400 ? "positive" : ""}">฿${formatDecimal.format(row.costNewMsg)}</td>
      <td>${formatNumber.format(row.messages)}</td>
      <td>฿${formatDecimal.format(row.cpmessaging)}</td>
      <td>${formatNumber.format(row.purchases)}</td>
      <td>฿${formatMoney.format(row.value)}</td>
      <td class="${row.fbRoas >= 1 ? "positive" : "negative"}">${formatDecimal.format(row.fbRoas)}</td>
      <td>${formatPercent(row.conversionRate)}</td>
      <td>${formatNumber.format(row.linePurchases)}</td>
      <td>฿${formatMoney.format(row.totalValue)}</td>
      <td class="${row.totalRoas >= 1 ? "positive" : "negative"}">${formatDecimal.format(row.totalRoas)}</td>
      <td>${isSuper(row) ? "✅" : "✕"}</td>
      <td>${formatNumber.format(row.totalViews)}</td>
      <td>${formatNumber.format(row.interactions)}</td>
      <td>${formatPercent(row.engageRate)}</td>
    </tr>
  `).join("");
}

function renderDetail(row = state.grouped.find((item) => item.key === state.selectedKey)) {
  if (!row) {
    els.detail.innerHTML = "เลือกแถวในตารางเพื่อดูรายละเอียด";
    els.detail.className = "detail-empty";
    return;
  }

  els.detail.className = "detail-body";
  const line = getLineMetrics(row.name);
  els.detail.innerHTML = `
    <div class="selected-card-row">
      <div class="selected-title">
        <span class="thumb large">${initials(row.name)}</span>
        <div>
          <h3>${escapeHtml(row.name)}</h3>
          <p class="eyebrow">${escapeHtml(row.adSet || "")}</p>
        </div>
      </div>
      <div class="detail-metrics inline">
        ${detailMetric("Spend", `฿${formatMoney.format(row.spend)}`)}
        ${detailMetric("FB Value", `฿${formatMoney.format(row.value)}`)}
        ${detailMetric("Line Value", `฿${formatMoney.format(row.lineValue)}`)}
        ${detailMetric("Total ROAS", formatDecimal.format(row.totalRoas))}
        ${detailMetric("Cost / Result", `฿${formatDecimal.format(row.cpr)}`)}
        ${detailMetric("Cost / Msg", `฿${formatDecimal.format(row.cpmessaging)}`)}
        ${detailMetric("Views", formatNumber.format(row.totalViews))}
        ${detailMetric("% Engage", formatPercent(row.engageRate))}
      </div>
      <form class="line-form inline" data-key="${escapeAttr(row.name)}">
        <label>
          <span>Line Messages</span>
          <input type="number" min="0" step="1" data-line-field="messages" value="${line.messages || ""}" />
        </label>
        <label>
          <span>Line Purchases</span>
          <input type="number" min="0" step="1" data-line-field="purchases" value="${line.purchases || ""}" />
        </label>
        <label>
          <span>Line Value</span>
          <input type="number" min="0" step="1" data-line-field="value" value="${line.value || ""}" />
        </label>
        <label>
          <span>FB Views</span>
          <input type="number" min="0" step="1" data-line-field="fbViews" value="${line.fbViews || ""}" />
        </label>
        <label>
          <span>Interactions + Link clicks</span>
          <input type="number" min="0" step="1" data-line-field="interactions" value="${line.interactions || ""}" />
        </label>
        <button class="primary-button line-apply" type="button" data-line-apply>คำนวณ</button>
      </form>
    </div>
  `;
}

function detailMetric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function formatPercent(value) {
  return `${formatPercentNumber.format((value || 0) * 100)}%`;
}

function isSuper(row) {
  return row.costNewMsg > 0 && row.costNewMsg < 400 && row.totalRoas >= 2;
}

function renderInsights() {
  if (!state.grouped.length) {
    els.insights.innerHTML = `<div class="insight"><b>รอข้อมูล</b><small>Import CSV เพื่อให้ระบบสรุป top performers และจุดที่ควรดูต่อ</small></div>`;
    return;
  }

  renderInsightTabs();
  const mode = state.insightMode;
  const configs = {
    roas: {
      min: (row) => row.spend >= 100,
      sort: (a, b) => b.totalRoas - a.totalRoas,
      label: (row) => `Total ROAS ${formatDecimal.format(row.totalRoas)} · Value ฿${formatMoney.format(row.totalValue)} · Spend ฿${formatMoney.format(row.spend)}`,
    },
    spend: {
      min: (row) => row.spend > 0,
      sort: (a, b) => b.spend - a.spend,
      label: (row) => `Spend ฿${formatMoney.format(row.spend)} · Total ROAS ${formatDecimal.format(row.totalRoas)} · Value ฿${formatMoney.format(row.totalValue)}`,
    },
    messages: {
      min: (row) => row.totalMessages > 0,
      sort: (a, b) => b.totalMessages - a.totalMessages,
      label: (row) => `Messages ${formatNumber.format(row.totalMessages)} · Cost/MSG ฿${formatDecimal.format(row.cpmessaging)} · New Msg ${formatNumber.format(row.contacts)}`,
    },
    purchases: {
      min: (row) => row.totalPurchases > 0,
      sort: (a, b) => b.totalPurchases - a.totalPurchases,
      label: (row) => `Purchases ${formatNumber.format(row.totalPurchases)} · FB ${formatNumber.format(row.purchases)} / Line ${formatNumber.format(row.linePurchases)} · Value ฿${formatMoney.format(row.totalValue)}`,
    },
    engage: {
      min: (row) => row.totalViews > 0,
      sort: (a, b) => b.engageRate - a.engageRate,
      label: (row) => `% Engage ${formatPercent(row.engageRate)} · Views ${formatNumber.format(row.totalViews)} · Interactions ${formatNumber.format(row.interactions)}`,
    },
    cost: {
      min: (row) => row.cpmessaging > 0,
      sort: (a, b) => a.cpmessaging - b.cpmessaging,
      label: (row) => `Cost/MSG ฿${formatDecimal.format(row.cpmessaging)} · Cost/New Msg ฿${formatDecimal.format(row.costNewMsg)} · Messages ${formatNumber.format(row.messages)}`,
    },
  };
  const config = configs[mode] || configs.roas;
  const topFive = state.grouped
    .filter(config.min)
    .sort(config.sort)
    .slice(0, 5);

  els.insights.innerHTML = topFive.map((row, index) => `
    <div class="insight rank">
      <span class="rank-no">${index + 1}</span>
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <small>${escapeHtml(config.label(row))}</small>
      </div>
    </div>
  `).join("") || `<div class="insight"><b>ยังไม่มีข้อมูล</b><small>หมวดนี้ต้องมีข้อมูลที่กรอกหรือ import เพิ่มก่อน</small></div>`;
}

function renderInsightTabs() {
  els.insightTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.insightMode === state.insightMode);
  });
}

function renderChart() {
  const canvas = els.chart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = Math.max(640, Math.floor(rect.width));
  const cssHeight = Math.max(320, Math.floor(rect.height));
  if (canvas.width !== Math.floor(cssWidth * ratio) || canvas.height !== Math.floor(cssHeight * ratio)) {
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = cssWidth;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!state.filtered.length) {
    ctx.fillStyle = "#66736f";
    ctx.font = "16px sans-serif";
    ctx.fillText("Import CSV เพื่อดู performance trend", 32, 160);
    return;
  }

  const points = state.trendMode === "week"
    ? aggregateByWeek(state.filtered)
    : state.trendMode === "month"
      ? aggregateByMonth(state.filtered)
      : aggregateByDate(state.filtered);
  els.trendSubtitle.textContent = `${points[0]?.date || ""} ถึง ${points[points.length - 1]?.date || ""}`;

  const padding = { left: 58, right: 42, top: 28, bottom: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxMoney = Math.max(...points.map((p) => Math.max(p.spend, p.value)), 1);
  const maxRoas = Math.max(...points.map((p) => p.roas), 1);

  ctx.strokeStyle = "#e2e7e5";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#66736f";
  ctx.font = "12px sans-serif";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (innerH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    const label = formatNumber.format(maxMoney - (maxMoney / 4) * i);
    ctx.fillText(label, 8, y + 4);
  }

  ctx.fillStyle = "#c9831a";
  ctx.fillText(`ROAS max ${formatDecimal.format(maxRoas)}`, width - 104, padding.top + 4);

  drawLine(ctx, points, "spend", maxMoney, "#11936a", padding, innerW, innerH);
  drawLine(ctx, points, "value", maxMoney, "#3578c8", padding, innerW, innerH);
  drawLine(ctx, points, "roas", maxRoas, "#c9831a", padding, innerW, innerH);

  const labelStep = Math.max(1, Math.ceil(points.length / 7));
  points.forEach((point, index) => {
    if (index % labelStep !== 0 && index !== points.length - 1) return;
    const x = padding.left + (points.length === 1 ? 0 : (innerW / (points.length - 1)) * index);
    ctx.fillStyle = "#66736f";
    ctx.fillText(point.date, x - 22, height - 18);
  });
}

function drawLine(ctx, points, key, max, color, padding, innerW, innerH) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = padding.left + (points.length === 1 ? innerW / 2 : (innerW / (points.length - 1)) * index);
    const y = padding.top + innerH - ((point[key] || 0) / max) * innerH;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function aggregateByDate(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.date || "unknown";
    const item = map.get(key) || { date: key, spend: 0, value: 0, roas: 0 };
    item.spend += row.spend;
    item.value += row.value;
    map.set(key, item);
  });
  return [...map.values()].map((row) => ({ ...row, roas: row.spend ? row.value / row.spend : 0 })).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByWeek(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = weekKey(row.date);
    const item = map.get(key) || { date: key, spend: 0, value: 0, roas: 0 };
    item.spend += row.spend;
    item.value += row.value;
    map.set(key, item);
  });
  return [...map.values()].map((row) => ({ ...row, roas: row.spend ? row.value / row.spend : 0 })).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByMonth(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.date.slice(0, 7) || "unknown";
    const item = map.get(key) || { date: key, spend: 0, value: 0, roas: 0 };
    item.spend += row.spend;
    item.value += row.value;
    map.set(key, item);
  });
  return [...map.values()].map((row) => ({ ...row, roas: row.spend ? row.value / row.spend : 0 })).sort((a, b) => a.date.localeCompare(b.date));
}

function weekKey(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "unknown";
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function renderAll() {
  renderKpis();
  renderDashboardOverview();
  renderTable();
  renderDetail();
  renderInsights();
  renderTrendTabs();
  renderChart();
}

function renderDashboardOverview() {
  const total = totals(state.grouped);
  els.overviewValue.textContent = `฿${formatMoney.format(total.totalValue)}`;
  els.overviewValueNote.textContent = `FB ฿${formatMoney.format(total.value)} / Line ฿${formatMoney.format(total.lineValue)}`;
  els.overviewRoas.textContent = formatDecimal.format(total.roas);
  els.overviewSuper.textContent = formatNumber.format(state.grouped.filter(isSuper).length);

  drawDonut(els.valueDonut, [
    { label: "FB", value: total.value, color: "#3578c8" },
    { label: "Line", value: total.lineValue, color: "#11936a" },
  ], "Value");

  const funnel = groupMetric(state.grouped, "funnel", "spend").sort((a, b) => b.value - a.value).slice(0, 6);
  drawBars(els.funnelBar, funnel, "฿");

  const monthValues = groupMetric(state.grouped, "month", "totalValue").sort((a, b) => a.label.localeCompare(b.label)).slice(-10);
  drawBars(els.monthlyBar, monthValues, "฿");

  drawDonut(els.performanceDonut, [
    { label: "SUPER", value: state.grouped.filter(isSuper).length, color: "#11936a" },
    { label: "Other", value: Math.max(0, state.grouped.length - state.grouped.filter(isSuper).length), color: "#d8dfdd" },
  ], "Content");
}

function renderFileList() {
  if (!els.fileList) return;
  if (!state.savedFiles.length) {
    els.fileList.innerHTML = `<div class="empty-state">ยังไม่มีไฟล์ที่บันทึกไว้ Import CSV เพื่อเริ่มใช้งาน</div>`;
    return;
  }
  els.fileList.innerHTML = state.savedFiles.map((file) => `
    <div class="file-item">
      <div>
        <strong>${escapeHtml(file.name)}</strong>
        <span>${formatFileSize(file.size)} · เพิ่มเมื่อ ${new Date(file.addedAt).toLocaleString("th-TH")}</span>
      </div>
      <button class="danger-button" type="button" data-delete-file="${escapeAttr(file.id)}">ลบ</button>
    </div>
  `).join("");
}

function formatFileSize(size) {
  if (size >= 1024 * 1024) return `${formatDecimal.format(size / (1024 * 1024))} MB`;
  if (size >= 1024) return `${formatDecimal.format(size / 1024)} KB`;
  return `${formatNumber.format(size || 0)} B`;
}

function groupMetric(rows, key, metric) {
  const map = new Map();
  rows.forEach((row) => {
    const label = row[key] || "-";
    map.set(label, (map.get(label) || 0) + (row[metric] || 0));
  });
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

function prepCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(280, Math.floor(rect.width || canvas.width));
  const height = Math.max(240, Math.floor(rect.height || canvas.height));
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawDonut(canvas, segments, centerLabel) {
  if (!canvas) return;
  const { ctx, width, height } = prepCanvas(canvas);
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  const cx = width * 0.36;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.28;
  let start = -Math.PI / 2;
  segments.forEach((item) => {
    const angle = total ? (item.value / total) * Math.PI * 2 : 0;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.lineWidth = 28;
    ctx.strokeStyle = item.color;
    ctx.stroke();
    start += angle;
  });
  ctx.fillStyle = "#17201d";
  ctx.font = "700 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(centerLabel, cx, cy - 2);
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#66736f";
  ctx.fillText(total ? formatNumber.format(total) : "0", cx, cy + 18);
  ctx.textAlign = "left";
  segments.forEach((item, index) => {
    const y = 84 + index * 30;
    ctx.fillStyle = item.color;
    ctx.fillRect(width * 0.68, y - 10, 12, 12);
    ctx.fillStyle = "#17201d";
    ctx.font = "13px sans-serif";
    ctx.fillText(`${item.label} ${formatNumber.format(item.value)}`, width * 0.68 + 20, y);
  });
}

function drawBars(canvas, items, prefix = "") {
  if (!canvas) return;
  const { ctx, width, height } = prepCanvas(canvas);
  const padding = { left: 112, right: 92, top: 24, bottom: 28 };
  const max = Math.max(...items.map((item) => item.value), 1);
  const rowH = (height - padding.top - padding.bottom) / Math.max(items.length, 1);
  ctx.font = "12px sans-serif";
  items.forEach((item, index) => {
    const y = padding.top + index * rowH + rowH * 0.5;
    const barW = ((width - padding.left - padding.right) * item.value) / max;
    const valueLabel = `${prefix}${formatNumber.format(item.value)}`;
    ctx.fillStyle = "#66736f";
    ctx.fillText(item.label.slice(0, 16), 16, y + 4);
    ctx.fillStyle = "#dff4ed";
    ctx.fillRect(padding.left, y - 10, width - padding.left - padding.right, 18);
    ctx.fillStyle = "#11936a";
    ctx.fillRect(padding.left, y - 10, barW, 18);
    const labelWidth = ctx.measureText(valueLabel).width;
    const outsideX = padding.left + barW + 8;
    if (outsideX + labelWidth <= width - 10) {
      ctx.fillStyle = "#17201d";
      ctx.textAlign = "left";
      ctx.fillText(valueLabel, outsideX, y + 4);
    } else {
      ctx.fillStyle = barW > labelWidth + 18 ? "#ffffff" : "#17201d";
      ctx.textAlign = barW > labelWidth + 18 ? "right" : "left";
      ctx.fillText(valueLabel, barW > labelWidth + 18 ? padding.left + barW - 8 : width - padding.right + 8, y + 4);
    }
    ctx.textAlign = "left";
  });
}

function renderTrendTabs() {
  els.trendTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.trendMode === state.trendMode);
  });
}

function setDefaults() {
  if (!state.rows.length) {
    els.dateFrom.value = "";
    els.dateTo.value = "";
    els.delivery.innerHTML = `<option value="all">ทั้งหมด</option>`;
    return;
  }
  const dates = state.rows.map((row) => row.date).filter(Boolean).sort();
  els.dateFrom.value = dates[0] || "";
  els.dateTo.value = dates[dates.length - 1] || "";

  const deliveries = [...new Set(state.rows.map((row) => row.delivery).filter(Boolean))].sort();
  els.delivery.innerHTML = `<option value="all">ทั้งหมด</option>${deliveries.map((item) => `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`).join("")}`;
}

function loadCsvTexts(files) {
  const combined = [];
  files.forEach((file, fileIndex) => {
    const rows = parseCsv(file.content);
    const normalized = normalizeRows(rows).map((row) => ({
      ...row,
      sourceFile: file.name,
      sourceFileId: file.id,
      id: `${file.id}-${row.id}`,
    }));
    combined.push(...normalized);
    if (fileIndex === 0 && !state.rows.length) state.selectedKey = null;
  });
  state.rows = combined;
  state.selectedKey = null;
  setDefaults();
  applyFilters();
}

async function refreshSavedFiles() {
  state.savedFiles = await getSavedFiles();
  loadCsvTexts(state.savedFiles);
  renderFileList();
}

function loadLineMetrics() {
  try {
    return JSON.parse(localStorage.getItem("adsDashboardLineMetrics") || "{}");
  } catch (error) {
    return {};
  }
}

function saveLineMetrics() {
  localStorage.setItem("adsDashboardLineMetrics", JSON.stringify(state.lineMetrics));
}

function getLineMetrics(key) {
  const item = state.lineMetrics[key] || {};
  return {
    messages: toNumber(item.messages),
    purchases: toNumber(item.purchases),
    value: toNumber(item.value),
    fbViews: toNumber(item.fbViews),
    interactions: toNumber(item.interactions),
  };
}

function setLineMetric(key, field, value) {
  const current = getLineMetrics(key);
  current[field] = toNumber(value);
  state.lineMetrics[key] = current;
  saveLineMetrics();
  refreshGroupedRows();
}

function setLineMetricsFromForm(form) {
  const key = form.dataset.key;
  const current = getLineMetrics(key);
  form.querySelectorAll("[data-line-field]").forEach((input) => {
    current[input.dataset.lineField] = toNumber(input.value);
  });
  state.lineMetrics[key] = current;
  saveLineMetrics();
  refreshGroupedRows();
}

function refreshGroupedRows() {
  const activeKey = state.selectedKey;
  state.grouped = sortRows(aggregate(state.filtered, els.groupBy.value));
  state.selectedKey = activeKey;
  renderAll();
}

function exportFilteredCsv() {
  const headers = ["Post Name", "Type", "Market", "Funnel", "Product", "Obj.", "Month", "Publish", "Spent", "Reach", "New Msg", "Cost/New Msg", "MSG", "Cost/MSG", "Purchase", "Purchase Conversion Value", "ROAS", "Conversion Rate %", "ยอดปิด Line", "ยอดรวม", "ROAS รวม", "SUPER", "Views", "Interactions + Link clicks", "% Engage"];
  const lines = state.grouped.map((row) => [
    row.name,
    row.type,
    row.market,
    row.funnel,
    row.product,
    row.objective,
    row.month,
    row.date,
    row.spend,
    row.reach,
    row.contacts,
    row.costNewMsg,
    row.messages,
    row.cpmessaging,
    row.purchases,
    row.value,
    row.fbRoas,
    formatPercent(row.conversionRate),
    row.linePurchases,
    row.totalValue,
    row.totalRoas,
    isSuper(row) ? "SUPER" : "",
    row.totalViews,
    row.interactions,
    formatPercent(row.engageRate),
  ]);
  const csv = [headers, ...lines].map((row) => row.map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ads-dashboard-filtered.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function initials(value) {
  const clean = String(value).replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/[()[\]/]/g, " ").trim();
  const letters = clean.match(/[A-Za-zก-๙]/g) || [];
  return letters.slice(0, 2).join("").toUpperCase() || "AD";
}

async function handleFileInput(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  for (const file of files) {
    await saveCsvFile(file, await file.text());
  }
  event.target.value = "";
  await refreshSavedFiles();
}

async function handleLoadSample() {
  try {
    const response = await fetch("ielts-_-_-Ads-May-8-2023-Jun-8-2026.csv");
    if (!response.ok) throw new Error("Cannot load sample");
    const content = await response.text();
    await saveCsvFile({
      name: "ielts-_-_-Ads-May-8-2023-Jun-8-2026.csv",
      size: content.length,
      lastModified: 0,
    }, content);
    await refreshSavedFiles();
  } catch (error) {
    alert("โหลดไฟล์ตัวอย่างไม่สำเร็จ กรุณาเปิดผ่าน local server หรือเลือกไฟล์ CSV ด้วยปุ่ม Import CSV");
  }
}

els.file.addEventListener("change", handleFileInput);
els.fileTop.addEventListener("change", handleFileInput);
els.loadSample.addEventListener("click", handleLoadSample);
els.loadSampleTop.addEventListener("click", handleLoadSample);

[els.search, els.groupBy, els.delivery, els.dateFrom, els.dateTo].forEach((input) => {
  input.addEventListener("input", applyFilters);
});

els.sortBy.addEventListener("input", () => {
  state.sortBy = els.sortBy.value;
  state.grouped = sortRows(state.grouped);
  state.page = 1;
  renderAll();
});

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    state.sortDir = state.sortBy === key && state.sortDir === "desc" ? "asc" : "desc";
    state.sortBy = key;
    els.sortBy.value = ["spend", "totalRoas", "purchases", "messages", "reach", "cpm", "cpr", "cpmessaging", "costNewMsg"].includes(key) ? key : els.sortBy.value;
    state.grouped = sortRows(state.grouped);
    renderTable();
  });
});

els.tableBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-key]");
  if (!row) return;
  state.selectedKey = row.dataset.key;
  renderTable();
  renderDetail();
});

els.detail.addEventListener("click", (event) => {
  const button = event.target.closest("[data-line-apply]");
  const form = event.target.closest(".line-form");
  if (!button || !form) return;
  setLineMetricsFromForm(form);
});

els.prevPage.addEventListener("click", () => {
  state.page = Math.max(1, state.page - 1);
  renderTable();
});

els.nextPage.addEventListener("click", () => {
  state.page += 1;
  renderTable();
});

els.exportCsv.addEventListener("click", exportFilteredCsv);

els.trendTabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.trendMode = button.dataset.trendMode;
    renderTrendTabs();
    renderChart();
  });
});

els.insightTabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.insightMode = button.dataset.insightMode;
    renderInsights();
  });
});

els.navItems.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    els.navItems.forEach((item) => item.classList.toggle("active", item === button));
    els.viewPanels.forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== view;
    });
    if (view === "dashboard") renderDashboardOverview();
    if (view === "content") {
      renderChart();
      renderInsights();
    }
  });
});

els.fileList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-file]");
  if (!button) return;
  await deleteCsvFile(button.dataset.deleteFile);
  await refreshSavedFiles();
});

els.clearFiles.addEventListener("click", async () => {
  await clearCsvFiles();
  await refreshSavedFiles();
});

renderAll();
els.viewPanels.forEach((panel) => {
  panel.hidden = panel.dataset.viewPanel !== "dashboard";
});
refreshSavedFiles().catch((error) => {
  console.error("Failed to load saved files", error);
  renderFileList();
});
