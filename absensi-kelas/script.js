// ================= KONFIGURASI =================
const CONFIG = { API_URL: "https://script.google.com/macros/s/AKfycbxNvzqyiHrzoWQm6Lc2gdQKlxpSqrtcFwNMkWM8-iGdtvmcxHXnwApo2lS4VyZPtzgymA/exec", TIMEOUT: 25000, LOW: 0.75 };
const state = { data: null, mi: null, draft: {}, date: "", cur: null, exists: false, busy: false, chart: null };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const KEYS = ["H", "S", "I", "A"];
const pct = (v) => Math.round((v || 0) * 100) + "%";
const p2 = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => y + "-" + p2(m) + "-" + p2(d);
const today = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? +m[3] + " " + MONTHS[+m[2] - 1] + " " + m[1] : "-"; };
const emptyHTML = (t, p) => `<div class="empty"><i class="fa-solid fa-folder-open"></i><h3>${t}</h3><p>${p}</p></div>`;
const cnt = (str) => { const c = { H: 0, S: 0, I: 0, A: 0 }; for (const ch of str) if (c[ch] !== undefined) c[ch]++; return c; };

// ================= UI =================
function toast(msg, type = "info") {
  const icons = { success: "circle-check", error: "circle-xmark", info: "circle-info" };
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `<i class="fa-solid fa-${icons[type]}"></i><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 3500);
}
function setStatus(s) {
  const map = { ok: ["circle-check", "Terhubung"], updating: ["circle-notch fa-spin", "Memperbarui"], error: ["circle-exclamation", "Gangguan koneksi"] };
  $("#status").className = "status " + s;
  $("#status").innerHTML = `<i class="fa-solid fa-${map[s][0]}"></i><b>${map[s][1]}</b>`;
  $("#errorBanner").hidden = s !== "error";
}

// ================= API =================
async function api(opt) {
  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith("YOUR_")) throw new Error("API_URL belum diatur");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT);
  try {
    const res = await fetch(CONFIG.API_URL, { ...opt, signal: ctrl.signal, redirect: "follow" });
    const j = await res.json();
    if (!j || !j.success) throw new Error((j && j.message) || "Permintaan gagal");
    return j;
  } finally { clearTimeout(t); }
}
async function load() {
  setStatus("updating");
  try {
    state.data = (await api({})).data;
    render(); setStatus("ok");
    const n = new Date(); $("#lastSync").innerHTML = `<i class="fa-regular fa-clock"></i> Terakhir diperbarui ${p2(n.getHours())}:${p2(n.getMinutes())}`;
  } catch (e) { setStatus("error"); toast(e.message, "error"); }
}

// ================= DATA TURUNAN =================
function derive() {
  const d = state.data;
  d.months.forEach((m) => {
    m.info = [];
    for (let i = 0; i < m.days; i++) {
      const c = { H: 0, S: 0, I: 0, A: 0, L: 0 };
      d.students.forEach((s) => { const ch = (m.grid[s.nis] || "")[i]; if (ch === "-") c.L++; else if (c[ch] !== undefined) c[ch]++; });
      c.t = c.H + c.S + c.I + c.A; m.info.push(c);
    }
  });
  d.days = [].concat(...d.months.map((m) => m.info.map((c, i) => (c.t ? { date: ymd(m.year, m.n, i + 1), c } : null)).filter(Boolean)));
  d.stats = d.students.map((s) => {
    const r = { ...s, pm: [], H: 0, S: 0, I: 0, A: 0 };
    d.months.forEach((m) => { const c = cnt(m.grid[s.nis] || ""); r.pm.push(c); KEYS.forEach((k) => (r[k] += c[k])); });
    r.t = r.H + r.S + r.I + r.A; r.p = r.t ? r.H / r.t : null; return r;
  });
}
const pill = (p) => (p === null ? "–" : `<span class="pill ${p >= CONFIG.LOW ? "ok" : "low"}">${p >= CONFIG.LOW ? "Baik" : "Rendah"}</span>`);

// ================= RENDER =================
function render() {
  derive();
  const d = state.data;
  $("#meta").innerHTML = `<i class="fa-solid fa-school"></i> ${esc(d.subtitle)} • Kelas ${esc(d.className)} • ${d.students.length} siswa`;
  $("#waliInfo").innerHTML = `<i class="fa-solid fa-user-tie"></i> Wali kelas: ${esc(d.wali)}`;
  $("#semName").textContent = esc(d.semester);
  const past = d.days.filter((x) => x.date <= today()), last = (past.length ? past : d.days).slice(-1)[0];
  if (state.mi === null) {
    const key = last ? last.date : today();
    const i = d.months.findIndex((m) => m.year === +key.slice(0, 4) && m.n === +key.slice(5, 7));
    state.mi = i >= 0 ? i : 0;
  }
  drawDash(past, last); drawMonthTabs(); drawMonth(); drawSemester(); drawStudents(); loadDraft();
}
function drawDash(past, last) {
  const d = state.data, c = last ? last.c : { H: 0, S: 0, I: 0, A: 0, t: 0 };
  $("#sRate").textContent = last ? pct(c.H / c.t) : "-"; $("#sRateT").textContent = last ? fmtDate(last.date) : "Belum ada data";
  $("#sHadir").textContent = last ? c.H : "-"; $("#sHadirT").textContent = last ? "dari " + c.t + " siswa" : "";
  $("#sAbsen").textContent = last ? c.S + c.I + c.A : "-"; $("#sAbsenT").textContent = last ? `Sakit ${c.S} • Izin ${c.I} • Alfa ${c.A}` : "";
  const tot = d.stats.reduce((a, s) => ({ H: a.H + s.H, t: a.t + s.t }), { H: 0, t: 0 });
  $("#sSem").textContent = tot.t ? pct(tot.H / tot.t) : "-"; $("#sSemT").textContent = d.days.length + " hari efektif tercatat";
 const now = new Date();
const cm = d.months.find((m) => m.year === now.getFullYear() && m.n === now.getMonth() + 1) || d.months[state.mi];
const labels = cm.info.map((_, i) => i + 1);
const vals = cm.info.map((c) => (c.t ? Math.round((c.H / c.t) * 100) : null));
$("#chartTitle").textContent = "Kehadiran " + cm.name + " " + cm.year;
  if (state.chart) state.chart.destroy();
  state.chart = new Chart($("#chart"), { type: "bar",
    data: { labels: labels, datasets: [{ label: "% hadir", data: vals, backgroundColor: "#DC2626", borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100, ticks: { color: "#A1A1AA" }, grid: { color: "rgba(255,255,255,.06)" } },x: { ticks: { color: "#A1A1AA", maxRotation: 0, minRotation: 0, autoSkip: window.innerWidth < 600, font: { size: 9 } }, grid: { display: false } } } } });
}
function drawMonthTabs() {
  $("#mTabs").innerHTML = state.data.months.map((m, i) => `<button type="button" data-i="${i}" class="${i === state.mi ? "on" : ""}">${m.name.slice(0, 3)}</button>`).join("");
}
function drawMonth() {
  const d = state.data, m = d.months[state.mi];
  if (m.missing) { $("#mInfo").textContent = ""; $("#mTable").innerHTML = "<tbody><tr><td>" + emptyHTML("Sheet tidak ditemukan", "Sheet Absen " + m.name + " belum ada.") + "</td></tr></tbody>"; return; }
  const dayNums = Array.from({ length: m.days }, (_, i) => i + 1);
  const head = `<thead><tr><th class="nm">Nama Siswa</th><th>L/P</th>` + dayNums.map((n) => { const w = new Date(m.year, m.n - 1, n).getDay(); return `<th class="${w === 0 || w === 6 ? "we" : ""}">${n}</th>`; }).join("") + `<th>H</th><th>S</th><th>I</th><th>A</th><th>%</th></tr></thead>`;
  const sum = { H: 0, S: 0, I: 0, A: 0 };
  const rows = d.students.map((s) => {
    const str = m.grid[s.nis] || "", c = cnt(str), t = c.H + c.S + c.I + c.A;
    KEYS.forEach((k) => (sum[k] += c[k]));
    return `<tr><td class="nm"><i>${s.no}</i>${esc(s.name)}</td><td>${esc(s.lp)}</td>` + dayNums.map((n) => { const ch = str[n - 1]; return ch && ch !== "." ? `<td class="c-${ch === "-" ? "L" : ch}">${ch}</td>` : "<td></td>"; }).join("") +
      `<td class="sm">${c.H}</td><td class="sm">${c.S}</td><td class="sm">${c.I}</td><td class="sm">${c.A}</td><td class="sm">${t ? pct(c.H / t) : "-"}</td></tr>`;
  }).join("");
  const T = sum.H + sum.S + sum.I + sum.A;
  const foot = `<tfoot><tr><td class="nm">TOTAL HADIR / HARI</td><td></td>` + m.info.map((c) => `<td>${c.t ? c.H : ""}</td>`).join("") + `<td>${sum.H}</td><td>${sum.S}</td><td>${sum.I}</td><td>${sum.A}</td><td>${T ? pct(sum.H / T) : "-"}</td></tr></tfoot>`;
  $("#mInfo").textContent = `${m.name} ${m.year} • ${m.info.filter((c) => c.t).length} hari tercatat`;
  $("#mTable").innerHTML = head + "<tbody>" + rows + "</tbody>" + foot;
}
function drawSemester() {
  const d = state.data, q = $("#rkSearch").value.trim().toLowerCase(), f = $("#rkFilter").value;
  const list = d.stats.filter((s) => s.name.toLowerCase().includes(q) && (f === "all" || (f === "low" ? s.p !== null && s.p < CONFIG.LOW : s.p !== null && s.p >= CONFIG.LOW)));
  if (!list.length) { $("#rkTable").innerHTML = "<tbody><tr><td>" + emptyHTML("Tidak ada data", "Coba ubah pencarian atau filter.") + "</td></tr></tbody>"; return; }
  const head = `<thead><tr><th class="nm">Nama Siswa</th><th>NIS</th><th>L/P</th>` + d.months.map((m) => `<th>Hadir ${m.name.slice(0, 3)}</th>`).join("") + `<th>Total H</th><th>Total S</th><th>Total I</th><th>Total A</th><th>% Semester</th><th>Status</th></tr></thead>`;
  const tot = { H: 0, S: 0, I: 0, A: 0 }, pmT = d.months.map(() => 0);
  const rows = list.map((s) => { KEYS.forEach((k) => (tot[k] += s[k])); s.pm.forEach((c, i) => (pmT[i] += c.H));
    return `<tr><td class="nm"><i>${s.no}</i>${esc(s.name)}</td><td>${esc(s.nis)}</td><td>${esc(s.lp)}</td>` + s.pm.map((c) => `<td>${c.H}</td>`).join("") +
      `<td class="sm">${s.H}</td><td class="sm">${s.S}</td><td class="sm">${s.I}</td><td class="sm">${s.A}</td><td class="sm">${s.p === null ? "-" : pct(s.p)}</td><td>${pill(s.p)}</td></tr>`; }).join("");
  const T = tot.H + tot.S + tot.I + tot.A;
  $("#rkTable").innerHTML = head + "<tbody>" + rows + `</tbody><tfoot><tr><td class="nm">TOTAL KELAS</td><td></td><td></td>` + pmT.map((x) => `<td>${x}</td>`).join("") + `<td>${tot.H}</td><td>${tot.S}</td><td>${tot.I}</td><td>${tot.A}</td><td>${T ? pct(tot.H / T) : "-"}</td><td></td></tr></tfoot>`;
}
function drawStudents() {
  const d = state.data, c = d.students.some((s) => s.hp !== undefined);
  $("#stCount").textContent = d.students.length + " siswa";
  $("#stTable").innerHTML = `<thead><tr><th class="nm">Nama Lengkap</th><th>NIS / NISN</th><th>L/P</th>${c ? "<th>No. HP Siswa</th><th>Orang Tua / Wali</th><th>No. HP Ortu</th>" : ""}</tr></thead><tbody>` +
    d.students.map((s) => `<tr><td class="nm"><i>${s.no}</i>${esc(s.name)}</td><td>${esc(s.nis)}</td><td>${esc(s.lp)}</td>${c ? `<td>${esc(s.hp)}</td><td>${esc(s.ortu)}</td><td>${esc(s.hpOrtu)}</td>` : ""}</tr>`).join("") + "</tbody>";
}

// ================= FORM ABSENSI =================
function loadDraft() {
  const [y, mo, dd] = state.date.split("-").map(Number);
  state.cur = state.data.months.find((m) => m.year === y && m.n === mo && !m.missing) || null;
  state.draft = {}; let any = false;
  state.data.students.forEach((s) => {
    const ch = state.cur ? (state.cur.grid[s.nis] || "")[dd - 1] : ".";
    const ok = ch && "HSIA-".includes(ch); if (ok) any = true;
    state.draft[s.nis] = ok ? ch : "H";
  });
  state.exists = any; drawForm();
}
function drawForm() {
  const w = new Date(state.date + "T00:00:00").getDay();
  $("#abInfo").textContent = !state.cur ? "Sheet absensi untuk bulan ini tidak tersedia, tanggal ini tidak bisa disimpan."
    : (state.exists ? "Absensi tanggal ini sudah tercatat. Menyimpan akan menimpa isi kotaknya di sheet." : "Belum ada data untuk tanggal ini. Semua diisi Hadir, ubah yang tidak hadir.") + (w === 0 || w === 6 ? " (Akhir pekan)" : "");
  $("#abList").innerHTML = state.data.students.map((s) => `<div class="ab-row"><span class="nm"><i>${s.no}</i>${esc(s.name)} <small class="muted">${esc(s.lp)}</small></span><div class="seg" data-nis="${esc(s.nis)}">` +
    KEYS.map((v) => `<button type="button" data-v="${v}" class="${state.draft[s.nis] === v ? "on" : ""}">${v}</button>`).join("") + "</div></div>").join("");
  const c = cnt(Object.values(state.draft).join("")), L = Object.values(state.draft).filter((v) => v === "-").length;
  $("#abSum").innerHTML = `<span>Hadir <b>${c.H}</b></span><span>Sakit <b>${c.S}</b></span><span>Izin <b>${c.I}</b></span><span>Alfa <b>${c.A}</b></span>` + (L ? `<span>Libur <b>${L}</b></span>` : "");
  $("#abSave").disabled = !state.cur || state.busy;
}
async function save() {
  if (state.busy || !state.cur) return;
  const btn = $("#abSave"), orig = btn.innerHTML;
  state.busy = true; btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Menyimpan…</span>';
  try {
    const r = await api({ method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "attendance", date: state.date, entries: state.data.students.map((s) => ({ nis: s.nis, status: state.draft[s.nis] })) }) });
    state.data = r.data; render(); toast(r.message || "Absensi tersimpan", "success");
  } catch (e) { toast(e.message, "error"); }
  finally { state.busy = false; btn.disabled = false; btn.innerHTML = orig; }
}

// ================= INIT =================
const dEl = $("#abDate"); dEl.value = state.date = today();
dEl.onchange = (e) => { state.date = e.target.value; if (state.data && state.date) loadDraft(); };
$("#abList").onclick = (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; state.draft[b.parentNode.dataset.nis] = b.dataset.v; drawForm(); };
const setAll = (v) => () => { if (!state.data) return; state.data.students.forEach((s) => (state.draft[s.nis] = v)); drawForm(); };
$("#allH").onclick = setAll("H"); $("#allL").onclick = setAll("-");
$("#abSave").onclick = save;
$("#mTabs").onclick = (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; state.mi = +b.dataset.i; drawMonthTabs(); drawMonth(); };
$("#refreshBtn").onclick = load;
["#rkSearch", "#rkFilter"].forEach((s) => ($(s).oninput = drawSemester));
load();
