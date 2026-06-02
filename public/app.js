const state = {
  password: sessionStorage.getItem("leaveAdminPassword") || "",
  rows: [],
};

const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const logoutButton = document.querySelector("#logoutButton");
const filters = document.querySelector("#filters");

function authHeaders() {
  return { Authorization: `Bearer ${state.password}` };
}

function paramsFromForm() {
  const data = new FormData(filters);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (String(value).trim()) params.set(key, String(value).trim());
  }
  return params;
}

async function api(path) {
  const response = await fetch(path, { headers: authHeaders() });
  if (response.status === 401) {
    sessionStorage.removeItem("leaveAdminPassword");
    showLogin();
    throw new Error("unauthorized");
  }
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function showLogin() {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  logoutButton.hidden = true;
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  logoutButton.hidden = false;
}

async function loadData() {
  const query = paramsFromForm().toString();
  const suffix = query ? `?${query}` : "";
  const [summary, leaves] = await Promise.all([
    api(`/api/summary${suffix}`),
    api(`/api/leaves${suffix}`),
  ]);
  renderSummary(summary);
  renderRows(leaves.rows || []);
}

function renderSummary(summary) {
  document.querySelector("#totalCount").textContent = summary.totalCount ?? 0;
  document.querySelector("#totalHours").textContent = Number(summary.totalHours ?? 0).toFixed(1);
  document.querySelector("#todayCount").textContent = summary.todayCount ?? 0;
  renderStats("#teamStats", summary.byTeam || [], "team_name");
  renderStats("#typeStats", summary.byType || [], "leave_type_name");
}

function renderStats(selector, rows, labelKey) {
  const target = document.querySelector(selector);
  const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
  target.innerHTML = rows.length
    ? rows
        .map((row) => {
          const pct = Math.max(4, (Number(row.count || 0) / max) * 100);
          return `
            <div class="stat-row">
              <strong>${escapeHtml(row[labelKey] || "未分類")}</strong>
              <div class="bar"><i style="width:${pct}%"></i></div>
              <span>${row.count} 筆 / ${Number(row.hours || 0).toFixed(1)}h</span>
            </div>
          `;
        })
        .join("")
    : `<div class="empty">目前沒有資料</div>`;
}

function renderRows(rows) {
  state.rows = rows;
  document.querySelector("#rowCount").textContent = `${rows.length} 筆`;
  const target = document.querySelector("#leaveRows");
  target.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
          <tr>
            <td>${formatDate(row.schedule_date)}</td>
            <td>${escapeHtml(row.worker_id)}</td>
            <td>${escapeHtml(row.employee_name)}</td>
            <td>${escapeHtml(row.team_name)}<br><span>${escapeHtml(row.shift_label)}</span></td>
            <td>${escapeHtml(row.leave_type_name)}</td>
            <td>${formatDate(row.start_date)} ${trimTime(row.start_time)}<br>${formatDate(row.end_date)} ${trimTime(row.end_time)}</td>
            <td>${Number(row.hours || 0).toFixed(1)}</td>
            <td>${escapeHtml(row.reason || "")}</td>
            <td>${row.medical_proof_url ? `<a href="${escapeHtml(row.medical_proof_url)}" target="_blank" rel="noreferrer">查看</a>` : ""}</td>
          </tr>
        `,
        )
        .join("")
    : `<tr><td class="empty" colspan="9">目前沒有符合條件的紀錄</td></tr>`;
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function trimTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.querySelector("#loginButton").addEventListener("click", async () => {
  state.password = document.querySelector("#passwordInput").value;
  sessionStorage.setItem("leaveAdminPassword", state.password);
  showDashboard();
  try {
    await loadData();
  } catch (error) {
    alert("登入失敗，請確認後台密碼");
    showLogin();
  }
});

logoutButton.addEventListener("click", () => {
  state.password = "";
  sessionStorage.removeItem("leaveAdminPassword");
  showLogin();
});

filters.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadData();
});

document.querySelector("#monthButton").addEventListener("click", async () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  filters.elements.from.value = first.toISOString().slice(0, 10);
  filters.elements.to.value = last.toISOString().slice(0, 10);
  await loadData();
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const params = paramsFromForm();
  params.set("token", state.password);
  window.open(`/api/leaves.csv?${params.toString()}`, "_blank");
});

if (state.password) {
  showDashboard();
  loadData().catch(showLogin);
} else {
  showLogin();
}
