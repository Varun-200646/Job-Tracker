/* ── State ───────────────────────────────────────────────────── */
let currentUser = JSON.parse(localStorage.getItem("jt_user") || "null");
let token = localStorage.getItem("jt_token") || null;
let jobs = [];
let editingId = null;
let searchQuery = "";
let sortables = [];
let resumeData = null; // Stored parsed resume from the AI module

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
    if (tab.dataset.page === "ai") renderAIPage();
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

    col.innerHTML = cards.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(j => {
      const matchHtml = renderMatchBadge(j);
      return `
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
        
        ${matchHtml}

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
    `}).join("");
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
  document.getElementById("f-jd").value       = job.jobDescription || "";
  document.getElementById("f-vault-select").value = job.resumeId || "";
  document.getElementById("resume-status").textContent = job.resumeOriginalName ? `Current file: ${job.resumeOriginalName}` : "";
  document.getElementById("modal-match-result").innerHTML = job.matchScore != null ? renderModalMatchResult(job) : "";
  openModal("Edit Job Application");
}

document.getElementById("job-form").addEventListener("submit", async e => {
  e.preventDefault();
  const role = document.getElementById("f-role").value.trim();
  const company = document.getElementById("f-company").value.trim();
  const fileInput = document.getElementById("f-resume");
  const file = fileInput.files[0];

  if (!role || !company) { showToast("Role and Company are required", "error"); return; }

  const vaultSelect = document.getElementById("f-vault-select");
  const vaultId = vaultSelect ? vaultSelect.value : "";
  let vaultResumeInfo = null;

  if (vaultId) {
    const selected = vaultResumes.find(r => r.id === vaultId);
    if (selected) {
      vaultResumeInfo = { url: selected.url, originalName: selected.originalName, id: vaultId };
    }
  }

  let uploadedResume = null;
  if (file) {
    showToast("Uploading resume to Vault...", "info");
    const formData = new FormData();
    formData.append("resume", file);
    formData.append("label", `Added for ${company} - ${role}`);
    try {
      const res = await fetch("/api/vault/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const result = await res.json();
        const r = result.resume;
        uploadedResume = { url: r.url, originalName: r.originalName, id: r.id };
        vaultResumes.unshift(r);
        renderVault();
      } else {
        showToast("Upload failed", "error");
      }
    } catch (err) {
      showToast("Server error during upload", "error");
    }
  }

  const jobDescription = document.getElementById("f-jd").value.trim();

  const finalResume = uploadedResume || vaultResumeInfo || (editingId ? { url: jobs.find(j => j.id === editingId).resumeUrl, originalName: jobs.find(j => j.id === editingId).resumeOriginalName, id: jobs.find(j => j.id === editingId).resumeId } : null);

  const data = {
    role,
    company,
    location: document.getElementById("f-location").value.trim(),
    type:     document.getElementById("f-type").value,
    salary:   document.getElementById("f-salary").value.trim(),
    status:   document.getElementById("f-status").value,
    date:     document.getElementById("f-date").value,
    notes:    document.getElementById("f-notes").value.trim(),
    jobDescription: jobDescription,
    resumeUrl: finalResume ? finalResume.url : null,
    resumeOriginalName: finalResume ? finalResume.originalName : null,
    resumeId: finalResume ? finalResume.id : null
  };

  // Run AI match if job description is provided and resume is uploaded
  if (jobDescription.length >= 10 && resumeData) {
    try {
      const matchRes = await fetch("/api/match-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ jobDescription })
      });
      if (matchRes.ok) {
        const match = await matchRes.json();
        data.matchScore = match.score;
        data.matchedSkills = match.matchedSkills;
        data.missingSkills = match.missingSkills;
        data.matchRecommendation = match.recommendation;
      }
    } catch (err) {
      console.warn("AI match failed, saving without score", err);
    }
  }

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
    loadVault();
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

/* ── AI Feature: Match Badge on Job Cards ──────────────────────── */
function renderMatchBadge(job) {
  if (job.matchScore == null) return "";
  const score = job.matchScore;
  const tier = score >= 70 ? "strong" : score >= 45 ? "moderate" : "weak";
  const icon = score >= 70 ? "✅" : score >= 45 ? "⚠️" : "❌";

  let html = `<div class="match-badge ${tier}">${icon} ${score}% Match</div>`;

  if (job.missingSkills && job.missingSkills.length > 0) {
    const id = `ms-${job.id}`;
    html += `
      <div class="missing-skills-wrap">
        <button class="missing-skills-toggle" onclick="toggleMissingSkills('${id}');event.stopPropagation()">Show missing skills (${job.missingSkills.length})</button>
        <div class="missing-skills-list" id="${id}" style="display:none">
          ${job.missingSkills.map(s => `<span class="missing-skill-pill">${esc(s)}</span>`).join("")}
        </div>
      </div>`;
  }
  return html;
}

function toggleMissingSkills(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === "none" ? "flex" : "none";
}

function renderModalMatchResult(job) {
  if (job.matchScore == null) return "";
  const score = job.matchScore;
  const tier = score >= 70 ? "strong" : score >= 45 ? "moderate" : "weak";
  return `
    <div class="ai-match-result">
      <div class="match-header">
        <div class="score-pill ${tier}">${score}%</div>
        <div class="match-label">${esc(job.matchRecommendation || "")}</div>
      </div>
      ${job.matchedSkills && job.matchedSkills.length > 0 ? `
        <div style="margin-top:6px">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Matched Skills</div>
          <div class="skill-tags">
            ${job.matchedSkills.map(s => `<span class="skill-tag">${esc(s)}</span>`).join("")}
          </div>
        </div>
      ` : ""}
      ${job.missingSkills && job.missingSkills.length > 0 ? `
        <div style="margin-top:6px">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Missing Skills</div>
          <div class="missing-skills-list" style="display:flex">
            ${job.missingSkills.map(s => `<span class="missing-skill-pill">${esc(s)}</span>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>`;
}

/* ── AI Feature: Load Resume Data ──────────────────────────────── */
async function loadResumeData() {
  if (!token) return;
  try {
    const res = await fetch("/api/resume", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      const result = await res.json();
      if (result.hasResume) {
        resumeData = result.data;
      }
    }
  } catch (err) {
    console.warn("Could not load resume data", err);
  }
}

/* ── AI Feature: Render AI Page ────────────────────────────────── */
function renderAIPage() {
  const infoEl = document.getElementById("resume-info-display");
  if (!resumeData) {
    infoEl.innerHTML = "";
    return;
  }
  infoEl.innerHTML = `
    <div class="resume-info">
      <div class="resume-file-badge">✅ ${esc(resumeData.fileName)} · Uploaded ${new Date(resumeData.uploadedAt).toLocaleDateString()}</div>

      ${resumeData.skills.length > 0 ? `
        <div class="resume-section">
          <div class="resume-section-title">Detected Skills (${resumeData.skills.length})</div>
          <div class="skill-tags">
            ${resumeData.skills.map(s => `<span class="skill-tag">${esc(s)}</span>`).join("")}
          </div>
        </div>
      ` : ""}

      ${resumeData.experience.length > 0 ? `
        <div class="resume-section">
          <div class="resume-section-title">Experience</div>
          <div class="experience-list">
            ${resumeData.experience.map(e => `<div class="experience-item">${esc(e)}</div>`).join("")}
          </div>
        </div>
      ` : ""}

      ${resumeData.education.length > 0 ? `
        <div class="resume-section">
          <div class="resume-section-title">Education</div>
          <div class="experience-list">
            ${resumeData.education.map(e => `<div class="experience-item">${esc(e)}</div>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>`;
}

/* ── AI Feature: Resume Upload Handler ─────────────────────────── */
function initAIUpload() {
  const fileInput = document.getElementById("ai-resume-input");
  const dropzone = document.getElementById("resume-dropzone");
  const statusEl = document.getElementById("resume-upload-status");

  if (!fileInput || !dropzone) return;

  // Drag & drop visual feedback
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".pdf")) {
      uploadResumePDF(file);
    } else {
      showToast("Only PDF files are supported", "error");
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) uploadResumePDF(file);
  });

  async function uploadResumePDF(file) {
    statusEl.innerHTML = `<div class="resume-uploading"><div class="spinner"></div> Parsing resume with AI…</div>`;

    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await fetch("/api/upload-resume", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      const result = await res.json();
      if (res.ok) {
        resumeData = result.data;
        statusEl.innerHTML = "";
        showToast(`Resume parsed! Found ${resumeData.skills.length} skills`, "success");
        renderAIPage();
      } else {
        statusEl.innerHTML = "";
        showToast(result.error || "Upload failed", "error");
      }
    } catch (err) {
      statusEl.innerHTML = "";
      showToast("Server error during upload", "error");
    }
  }
}

/* ── AI Feature: Quick Match ───────────────────────────────────── */
function initQuickMatch() {
  const btn = document.getElementById("btn-quick-match");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const jd = document.getElementById("quick-jd").value.trim();
    const resultEl = document.getElementById("quick-match-result");

    if (!resumeData) {
      resultEl.innerHTML = `<div class="no-resume-notice">⚠️ Upload your resume first to enable AI matching</div>`;
      return;
    }
    if (jd.length < 10) {
      showToast("Please enter a longer job description", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Analyzing…";

    try {
      const res = await fetch("/api/match-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ jobDescription: jd })
      });
      const match = await res.json();
      if (res.ok) {
        const tier = match.score >= 70 ? "strong" : match.score >= 45 ? "moderate" : "weak";
        const color = match.score >= 70 ? "#22c55e" : match.score >= 45 ? "#f59e0b" : "#ef4444";
        const circumference = 2 * Math.PI * 50;
        const offset = circumference - (match.score / 100) * circumference;

        resultEl.innerHTML = `
          <div style="margin-top:20px">
            <div class="score-ring-wrap">
              <div class="score-ring">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle class="ring-bg" cx="60" cy="60" r="50"/>
                  <circle class="ring-fill" cx="60" cy="60" r="50"
                    stroke="${color}"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${offset}" />
                </svg>
                <div class="score-text">${match.score}%</div>
              </div>
              <div class="score-recommendation">${esc(match.recommendation)}</div>
            </div>

            ${match.matchedSkills.length > 0 ? `
              <div class="resume-section" style="margin-top:16px">
                <div class="resume-section-title">✅ Matched Skills (${match.matchedSkills.length})</div>
                <div class="skill-tags">
                  ${match.matchedSkills.map(s => `<span class="skill-tag">${esc(s)}</span>`).join("")}
                </div>
              </div>
            ` : ""}

            ${match.missingSkills.length > 0 ? `
              <div class="resume-section" style="margin-top:12px">
                <div class="resume-section-title">❌ Missing Skills (${match.missingSkills.length})</div>
                <div class="missing-skills-list" style="display:flex">
                  ${match.missingSkills.map(s => `<span class="missing-skill-pill">${esc(s)}</span>`).join("")}
                </div>
              </div>
            ` : ""}
          </div>`;
      } else {
        resultEl.innerHTML = `<div class="no-resume-notice">❌ ${esc(match.error || "Match failed")}</div>`;
      }
    } catch (err) {
      resultEl.innerHTML = `<div class="no-resume-notice">❌ Server error</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "🧠 Analyze Match";
    }
  });
}

/* ── AI Feature: Modal JD Live Match ───────────────────────────── */
let _jdDebounce;
function initModalJDMatch() {
  const jdField = document.getElementById("f-jd");
  if (!jdField) return;

  jdField.addEventListener("input", () => {
    clearTimeout(_jdDebounce);
    _jdDebounce = setTimeout(async () => {
      const jd = jdField.value.trim();
      const resultEl = document.getElementById("modal-match-result");

      if (!resumeData) {
        if (jd.length > 10) {
          resultEl.innerHTML = `<div class="no-resume-notice">⚠️ Upload your resume in the AI Match tab to see match scores</div>`;
        }
        return;
      }
      if (jd.length < 10) {
        resultEl.innerHTML = "";
        return;
      }

      try {
        const res = await fetch("/api/match-job", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ jobDescription: jd })
        });
        if (res.ok) {
          const match = await res.json();
          resultEl.innerHTML = renderModalMatchResult({
            matchScore: match.score,
            matchedSkills: match.matchedSkills,
            missingSkills: match.missingSkills,
            matchRecommendation: match.recommendation
          });
        }
      } catch (err) {
        // silently fail for live preview
      }
    }, 600);
  });
}

/* ── Resume Vault ────────────────────────────────────────────────── */
let vaultResumes = [];
let vaultSelectedFile = null;

async function loadVault() {
  if (!token) return;
  try {
    const res = await fetch("/api/vault", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      vaultResumes = await res.json();
      renderVault();
    }
  } catch (err) {
    console.warn("Could not load vault", err);
  }
}

function renderVault() {
  const grid = document.getElementById("vault-grid");
  const empty = document.getElementById("vault-empty");
  const select = document.getElementById("f-vault-select");
  
  if (select) {
    select.innerHTML = `<option value="">-- Choose from Vault --</option>` + 
      vaultResumes.map(r => `<option value="${r.id}">${esc(r.label)} (${esc(r.originalName)})</option>`).join("");
  }

  if (!grid) return;

  if (vaultResumes.length === 0) {
    grid.innerHTML = `
      <div class="vault-empty" id="vault-empty">
        <div class="vault-empty-icon">🗂️</div>
        <div class="vault-empty-text">No resumes uploaded yet</div>
        <div class="vault-empty-sub">Click "Upload Resume" to add your first file</div>
      </div>`;
    return;
  }

  grid.innerHTML = vaultResumes.map((r, idx) => {
    const ext = (r.originalName || "").split(".").pop().toLowerCase();
    const extClass = ["pdf", "docx", "doc"].includes(ext) ? ext : "other";
    const fileSize = formatFileSize(r.fileSize);
    const uploadDate = new Date(r.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const tags = r.tags || [];
    const hasJD = r.jobDescription && r.jobDescription.trim().length > 0;

    return `
      <div class="vault-card" style="animation-delay: ${idx * 0.05}s">
        <div class="vault-card-top">
          <div class="vault-file-icon ${extClass}">${ext.toUpperCase()}</div>
          <div class="vault-card-info">
            <div class="vault-card-label">${esc(r.label)}</div>
            <div class="vault-card-filename">${esc(r.originalName)}</div>
          </div>
        </div>

        ${tags.length > 0 ? `
          <div class="vault-card-meta">
            ${tags.map(t => `<span class="vault-tag">${esc(t)}</span>`).join("")}
          </div>
        ` : ""}

        <div class="vault-card-details">
          <span class="detail-item">📦 ${fileSize}</span>
          <span class="detail-item">📅 ${uploadDate}</span>
        </div>

        ${hasJD ? `
          <div class="vault-card-jd">
            <button class="vault-jd-toggle" onclick="toggleVaultJD('vault-jd-${r.id}')">
              📋 View Job Description
            </button>
            <div class="vault-jd-content" id="vault-jd-${r.id}" style="display: none;">
              ${esc(r.jobDescription)}
            </div>
          </div>
        ` : ""}

        <div class="vault-card-actions">
          <button class="btn-download" onclick="downloadVaultResume('${r.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
          <button class="btn-delete-vault" onclick="deleteVaultResume('${r.id}')">
            🗑 Delete
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function formatFileSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function toggleVaultJD(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
}

async function downloadVaultResume(id) {
  try {
    const res = await fetch(`/api/vault/${id}/download`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) {
      showToast("Download failed", "error");
      return;
    }
    // Get the filename from content-disposition header if available
    const disposition = res.headers.get("Content-Disposition");
    let filename = "resume";
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) filename = match[1].replace(/['"]/g, "");
    } else {
      // Fallback: find the resume and use originalName
      const resume = vaultResumes.find(r => r.id === id);
      if (resume) filename = resume.originalName;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast("Download started", "success");
  } catch (err) {
    showToast("Download error", "error");
  }
}

async function deleteVaultResume(id) {
  if (!confirm("Delete this resume from vault? The file will be permanently removed.")) return;
  try {
    const res = await fetch(`/api/vault/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      vaultResumes = vaultResumes.filter(r => r.id !== id);
      renderVault();
      showToast("Resume deleted", "success");
    } else {
      showToast("Failed to delete", "error");
    }
  } catch (err) {
    showToast("Server error", "error");
  }
}

function initVault() {
  const toggleBtn = document.getElementById("btn-vault-toggle-upload");
  const uploadArea = document.getElementById("vault-upload-area");
  const cancelBtn = document.getElementById("btn-vault-cancel");
  const submitBtn = document.getElementById("btn-vault-submit");
  const fileInput = document.getElementById("vault-file-input");
  const dropzone = document.getElementById("vault-dropzone");
  const statusEl = document.getElementById("vault-upload-status");

  if (!toggleBtn || !uploadArea) return;

  // Toggle upload area
  toggleBtn.addEventListener("click", () => {
    const isHidden = uploadArea.style.display === "none";
    uploadArea.style.display = isHidden ? "block" : "none";
    if (isHidden) uploadArea.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  cancelBtn.addEventListener("click", () => {
    uploadArea.style.display = "none";
    resetVaultUpload();
  });

  // Drag visual feedback
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) selectVaultFile(file);
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) selectVaultFile(fileInput.files[0]);
  });

  function selectVaultFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "doc", "docx"].includes(ext)) {
      showToast("Only PDF and DOCX files are supported", "error");
      return;
    }
    vaultSelectedFile = file;
    dropzone.classList.add("file-selected");
    dropzone.querySelector(".drop-title").textContent = file.name;
    dropzone.querySelector(".drop-sub").textContent = formatFileSize(file.size) + " · Click to change";
    submitBtn.disabled = false;
  }

  function resetVaultUpload() {
    vaultSelectedFile = null;
    fileInput.value = "";
    dropzone.classList.remove("file-selected");
    dropzone.querySelector(".drop-title").textContent = "Drop your resume here";
    dropzone.querySelector(".drop-sub").textContent = "or click to browse · PDF, DOCX supported";
    submitBtn.disabled = true;
    document.getElementById("vault-label").value = "";
    document.getElementById("vault-tags").value = "";
    document.getElementById("vault-jd").value = "";
    statusEl.innerHTML = "";
  }

  // Submit upload
  submitBtn.addEventListener("click", async () => {
    if (!vaultSelectedFile) return;

    const label = document.getElementById("vault-label").value.trim() || vaultSelectedFile.name;
    const tagsRaw = document.getElementById("vault-tags").value.trim();
    const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];
    const jd = document.getElementById("vault-jd").value.trim();

    submitBtn.disabled = true;
    statusEl.innerHTML = `<div class="vault-uploading"><div class="spinner"></div> Uploading…</div>`;

    const formData = new FormData();
    formData.append("resume", vaultSelectedFile);
    formData.append("label", label);
    formData.append("tags", JSON.stringify(tags));
    formData.append("jobDescription", jd);

    try {
      const res = await fetch("/api/vault/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      const result = await res.json();
      if (res.ok) {
        vaultResumes.unshift(result.resume);
        renderVault();
        showToast(`"${label}" uploaded to vault!`, "success");
        resetVaultUpload();
        uploadArea.style.display = "none";
      } else {
        showToast(result.error || "Upload failed", "error");
        submitBtn.disabled = false;
        statusEl.innerHTML = "";
      }
    } catch (err) {
      showToast("Server error during upload", "error");
      submitBtn.disabled = false;
      statusEl.innerHTML = "";
    }
  });
}

/* ── Init ────────────────────────────────────────────────────── */
checkAuth();
initAIUpload();
initQuickMatch();
initModalJDMatch();
initVault();
if (token) {
  loadResumeData();
  loadVault();
}

