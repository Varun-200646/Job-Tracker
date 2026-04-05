/* ── State ───────────────────────────────────────────────────── */
let currentUser = JSON.parse(localStorage.getItem("jt_user") || "null");
let token = localStorage.getItem("jt_token") || null;
let jobs = [];
let editingId = null;
let searchQuery = "";
let sortables = [];

const STATUSES = ["applied", "interview", "offer", "rejected"];
const STATUS_LABELS = { applied:"Applied", interview:"Interview", offer:"Offer", rejected:"Rejected" };
const STATUS_COLORS = { applied:"#3b82f6", interview:"#f59e0b", offer:"#22c55e", rejected:"#ef4444" };
const JOB_TYPES = ["Full-time","Part-time","Internship","Contract","Remote","Hybrid"];

/* ── Persistence ─────────────────────────────────────────────── */
async function loadJobs() {
  try {
    const res = await fetch("/api/jobs", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      jobs = await res.json();
      renderBoard();
    } else if (res.status === 401 || res.status === 403) {
      logout();
    }
  } catch (err) {
    showToast("Error loading jobs", "error");
  }
}

async function save() {
  if (!token) return;
  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(jobs)
    });
    if (!res.ok) throw new Error();
  } catch (err) {
    showToast("Error saving data", "error");
  }
}

/* ── Theme ───────────────────────────────────────────────────── */
const theme = localStorage.getItem("jt_theme") || "light";
document.documentElement.setAttribute("data-theme", theme);
setThemeIcon(theme);

document.getElementById("theme-toggle").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("jt_theme", next);
  setThemeIcon(next);
});

function setThemeIcon(t) {
  document.getElementById("theme-toggle").textContent = t === "dark" ? "☀️" : "🌙";
}

/* ── Navigation ──────────────────────────────────────────────── */
document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("page-" + tab.dataset.page).classList.add("active");
    if (tab.dataset.page === "stats") renderCharts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

/* ── Helpers ─────────────────────────────────────────────────── */
function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function initials(name) {
  return (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
}
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}
function uid() { return Date.now() + Math.floor(Math.random()*1000); }

/* ── Stats ───────────────────────────────────────────────────── */
function updateStats() {
  document.getElementById("stat-total").textContent = jobs.length;
  STATUSES.forEach(s => {
    const el = document.getElementById("stat-" + s);
    if (el) el.textContent = jobs.filter(j => j.status === s).length;
  });
  // rate
  const closed = jobs.filter(j => j.status === "offer" || j.status === "rejected").length;
  const rate = closed > 0 ? Math.round((jobs.filter(j=>j.status==="offer").length / closed)*100) : 0;
  const rateEl = document.getElementById("stat-rate");
  if (rateEl) rateEl.textContent = rate + "%";

  // tab counts
  document.querySelectorAll(".nav-tab").forEach(tab => {
    const page = tab.dataset.page;
    const countEl = tab.querySelector(".tab-count");
    if (countEl) {
      if (page === "board") countEl.textContent = jobs.length;
    }
  });
}

/* ── Kanban Board ────────────────────────────────────────────── */
function getFiltered() {
  if (!searchQuery) return jobs;
  const q = searchQuery.toLowerCase();
  return jobs.filter(j =>
    (j.role||"").toLowerCase().includes(q) ||
    (j.company||"").toLowerCase().includes(q) ||
    (j.location||"").toLowerCase().includes(q)
  );
}

function renderBoard() {
  const filtered = getFiltered();
  STATUSES.forEach(status => {
    const col = document.getElementById("col-" + status);
    if (!col) return;
    const cards = filtered.filter(j => j.status === status);
    document.getElementById("count-" + status).textContent = cards.length;

    if (cards.length === 0) {
      col.innerHTML = `<div class="col-empty"><div class="icon">📭</div>No jobs here</div>`;
      return;
    }

    col.innerHTML = cards.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(j => `
      <div class="job-card" data-id="${j.id}">
        <div class="job-card-top">
          <div class="company-logo">${esc(initials(j.company))}</div>
          <div>
            <div class="job-role">${esc(j.role)}</div>
            <div class="job-company">${esc(j.company)}</div>
          </div>
        </div>
        <div class="job-meta">
          ${j.location ? `<span class="tag tag-location">📍 ${esc(j.location)}</span>` : ""}
          ${j.type     ? `<span class="tag tag-type">${esc(j.type)}</span>` : ""}
          ${j.salary   ? `<span class="tag tag-salary">${esc(j.salary)}</span>` : ""}
        </div>
        <div class="job-date">Applied: ${fmtDate(j.date)}</div>
        ${j.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;font-style:italic;">"${esc(j.notes)}"</div>` : ""}
        
        ${j.resumeUrl ? `
          <div style="margin-top:10px;">
            <a href="${j.resumeUrl}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 8px;border:1px solid var(--border)">
              📄 View Resume
            </a>
          </div>
        ` : ""}

        <div class="job-card-actions" style="margin-top:12px;">
          <button class="btn btn-ghost btn-sm" onclick="openEdit(${j.id});event.stopPropagation()">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteJob(${j.id});event.stopPropagation()">🗑 Delete</button>
          <div style="flex:1"></div>
          <select class="filter-select" style="font-size:11px;padding:4px 6px;" onchange="changeStatus(${j.id},this.value);event.stopPropagation()">
            ${STATUSES.map(s=>`<option value="${s}" ${s===j.status?"selected":""}>${STATUS_LABELS[s]}</option>`).join("")}
          </select>
        </div>
      </div>
    `).join("");
  });
  updateStats();
  initSortable();
}

function initSortable() {
  sortables.forEach(s => s.destroy());
  sortables = [];
  STATUSES.forEach(s => {
    const el = document.getElementById("col-" + s);
    if (!el) return;
    sortables.push(new Sortable(el, {
      group: "kanban",
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: (evt) => {
        const id = parseInt(evt.item.dataset.id);
        const newStatus = evt.to.id.replace("col-","");
        const job = jobs.find(j => j.id === id);
        if (job && job.status !== newStatus) {
          job.status = newStatus;
          save();
          showToast(`Moved to ${STATUS_LABELS[newStatus]}`, "info");
          updateStats();
          // We don't need full renderBoard here as DOM is already updated by Sortable
          // but we might need to update the status dropdown inside the card
          renderBoard(); 
        }
      }
    }));
  });
}

function changeStatus(id, newStatus) {
  const job = jobs.find(j => j.id === id);
  if (job) { job.status = newStatus; save(); renderBoard(); showToast(`Moved to ${STATUS_LABELS[newStatus]}`, "info"); }
}

function deleteJob(id) {
  if (!confirm("Delete this job application?")) return;
  jobs = jobs.filter(j => j.id !== id);
  save(); renderBoard(); showToast("Deleted", "success");
}

/* ── Search ──────────────────────────────────────────────────── */
document.getElementById("search-input").addEventListener("input", e => {
  searchQuery = e.target.value;
  renderBoard();
});

/* ── Modal ───────────────────────────────────────────────────── */
function openModal(title) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-backdrop").classList.add("open");
  document.getElementById("f-role").focus();
}

function closeModal() {
  document.getElementById("modal-backdrop").classList.remove("open");
  document.getElementById("job-form").reset();
  editingId = null;
}

document.getElementById("modal-backdrop").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-backdrop")) closeModal();
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("btn-cancel").addEventListener("click", closeModal);

document.getElementById("btn-add-job").addEventListener("click", () => {
  editingId = null;
  document.getElementById("job-form").reset();
  document.getElementById("f-date").value = new Date().toISOString().split("T")[0];
  openModal("Add Job Application");
});

function openEdit(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  editingId = id;
  document.getElementById("f-role").value     = job.role || "";
  document.getElementById("f-company").value  = job.company || "";
  document.getElementById("f-location").value = job.location || "";
  document.getElementById("f-type").value     = job.type || "Full-time";
  document.getElementById("f-salary").value   = job.salary || "";
  document.getElementById("f-status").value   = job.status || "applied";
  document.getElementById("f-date").value     = job.date || "";
  document.getElementById("f-notes").value    = job.notes || "";
  document.getElementById("resume-status").textContent = job.resumeOriginalName ? `Current file: ${job.resumeOriginalName}` : "";
  openModal("Edit Job Application");
}

document.getElementById("job-form").addEventListener("submit", async e => {
  e.preventDefault();
  const role = document.getElementById("f-role").value.trim();
  const company = document.getElementById("f-company").value.trim();
  const fileInput = document.getElementById("f-resume");
  const file = fileInput.files[0];

  if (!role || !company) { showToast("Role and Company are required", "error"); return; }

  let resumeData = null;
  if (file) {
    showToast("Uploading resume...", "info");
    const formData = new FormData();
    formData.append("resume", file);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        resumeData = await res.json();
      } else {
        showToast("Upload failed", "error");
      }
    } catch (err) {
      showToast("Server error during upload", "error");
    }
  }

  const data = {
    role,
    company,
    location: document.getElementById("f-location").value.trim(),
    type:     document.getElementById("f-type").value,
    salary:   document.getElementById("f-salary").value.trim(),
    status:   document.getElementById("f-status").value,
    date:     document.getElementById("f-date").value,
    notes:    document.getElementById("f-notes").value.trim(),
    resumeUrl: resumeData ? resumeData.url : (editingId ? jobs.find(j => j.id === editingId).resumeUrl : null),
    resumeOriginalName: resumeData ? resumeData.originalName : (editingId ? jobs.find(j => j.id === editingId).resumeOriginalName : null)
  };

  if (editingId) {
    const idx = jobs.findIndex(j => j.id === editingId);
    if (idx > -1) jobs[idx] = { ...jobs[idx], ...data };
    showToast("Application updated!", "success");
  } else {
    jobs.unshift({ id: uid(), ...data });
    showToast("Application added!", "success");
  }

  save(); closeModal(); renderBoard();
});

/* ── Charts ──────────────────────────────────────────────────── */
function renderCharts() {
  renderDonut();
  renderBarChart();
  renderTimeline();
}

function renderDonut() {
  const counts = STATUSES.map(s => jobs.filter(j=>j.status===s).length);
  const total = counts.reduce((a,b)=>a+b,0) || 1;
  const r = 60, cx = 80, cy = 80, circumference = 2*Math.PI*r;
  let offset = 0;

  const slices = STATUSES.map((s,i) => {
    const pct = counts[i]/total;
    const dash = pct * circumference;
    const slice = `<circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${STATUS_COLORS[s]}" stroke-width="22"
      stroke-dasharray="${dash} ${circumference - dash}"
      stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"
      style="transition:stroke-dasharray .6s ease"/>`;
    offset += dash;
    return slice;
  }).join("");

  document.getElementById("donut-svg").innerHTML = `
    <svg class="donut-svg" width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="22"/>
      ${slices}
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
        style="font-family:var(--mono);font-size:22px;font-weight:700;fill:var(--text)">${total}</text>
      <text x="${cx}" y="${cy+20}" text-anchor="middle"
        style="font-family:var(--font);font-size:11px;fill:var(--text-muted)">total</text>
    </svg>`;

  document.getElementById("donut-legend").innerHTML = STATUSES.map((s,i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${STATUS_COLORS[s]}"></div>
      <span class="legend-label">${STATUS_LABELS[s]}</span>
      <span class="legend-val">${counts[i]}</span>
    </div>`).join("");
}

function renderBarChart() {
  const counts = STATUSES.map(s => jobs.filter(j=>j.status===s).length);
  const max = Math.max(...counts, 1);
  document.getElementById("bar-chart").innerHTML = STATUSES.map((s,i) => `
    <div class="bar-row">
      <div class="bar-label">${STATUS_LABELS[s]}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(counts[i]/max*100)}%;background:${STATUS_COLORS[s]}"></div>
      </div>
      <div class="bar-val">${counts[i]}</div>
    </div>`).join("");
}

function renderTimeline() {
  // Group jobs by month
  const map = {};
  jobs.forEach(j => {
    if (!j.date) return;
    const key = j.date.slice(0,7);
    map[key] = (map[key]||0)+1;
  });
  const keys = Object.keys(map).sort().slice(-6);
  if (keys.length === 0) {
    document.getElementById("timeline-chart").innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">No data yet</div>`;
    return;
  }
  const maxV = Math.max(...keys.map(k=>map[k]),1);
  document.getElementById("timeline-chart").innerHTML = keys.map(k => {
    const [y,m] = k.split("-");
    const label = new Date(y,m-1).toLocaleDateString("en",{month:"short"});
    const pct = Math.max((map[k]/maxV)*100, 4);
    return `<div class="tl-month">
      <div class="tl-label">${label}</div>
      <div class="tl-bar-wrap">
        <div class="tl-bar" style="width:${pct}%"><span>${map[k]}</span></div>
      </div>
    </div>`;
  }).join("");
}

/* ── Toast ───────────────────────────────────────────────────── */
let _toastT;
function showToast(msg, type="success") {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(_toastT);
  _toastT = setTimeout(()=>t.classList.remove("show"), 3000);
}

/* ── Auth Logic ─────────────────────────────────────────────── */
function checkAuth() {
  const authContainer = document.getElementById("auth-container");
  const mainContent = document.getElementById("main-content");
  const logoutBtn = document.getElementById("btn-logout");
  const addJobBtn = document.getElementById("btn-add-job");

  if (token && currentUser) {
    authContainer.style.display = "none";
    mainContent.style.display = "block";
    logoutBtn.style.display = "flex";
    addJobBtn.style.display = "flex";
    loadJobs();
  } else {
    authContainer.style.display = "flex";
    mainContent.style.display = "none";
    logoutBtn.style.display = "none";
    addJobBtn.style.display = "none";
  }
}

// Toggle between Login and Signup
document.getElementById("show-signup").onclick = (e) => {
  e.preventDefault();
  document.getElementById("login-form-wrap").style.display = "none";
  document.getElementById("signup-form-wrap").style.display = "block";
};

document.getElementById("show-login").onclick = (e) => {
  e.preventDefault();
  document.getElementById("signup-form-wrap").style.display = "none";
  document.getElementById("login-form-wrap").style.display = "block";
};

// Handle Login
document.getElementById("login-form").onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById("l-username").value;
  const password = document.getElementById("l-password").value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      currentUser = { username: data.username };
      localStorage.setItem("jt_token", token);
      localStorage.setItem("jt_user", JSON.stringify(currentUser));
      showToast("Login successful!", "success");
      checkAuth();
    } else {
      showToast(data.error || "Login failed", "error");
    }
  } catch (err) {
    showToast("Server error", "error");
  }
};

// Handle Signup
document.getElementById("signup-form").onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById("s-username").value;
  const password = document.getElementById("s-password").value;

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      currentUser = { username: data.username };
      localStorage.setItem("jt_token", token);
      localStorage.setItem("jt_user", JSON.stringify(currentUser));
      showToast("Account created!", "success");
      checkAuth();
    } else {
      showToast(data.error || "Signup failed", "error");
    }
  } catch (err) {
    showToast("Server error", "error");
  }
};

// Handle Logout
function logout() {
  localStorage.removeItem("jt_token");
  localStorage.removeItem("jt_user");
  token = null;
  currentUser = null;
  checkAuth();
}

document.getElementById("btn-logout").onclick = () => {
  logout();
  showToast("Logged out", "info");
};

/* ── Init ────────────────────────────────────────────────────── */
checkAuth();
