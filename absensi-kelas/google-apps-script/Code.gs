/** Absensi Kelas - Google Apps Script API (dengan login & riwayat aktivitas)
 *  Sheet "Data Siswa"    : baris 8+ -> A=No, B=NIS, C=Nama, D=L/P, E..G = kontak (B4=Kelas, B5=Wali, A2=Sekolah/TA)
 *  Sheet "Absen <Bulan>" : baris 7+ -> A..D identitas, E.. = tanggal 1..31 (H/S/I/A/-)
 *  Sheet "Akun"          : dibuat oleh setupAkun() -> Username, Nama, Peran, Salt, Hash, Aktif, Terakhir Ganti Password
 *  Sheet "Riwayat"       : dibuat otomatis -> Waktu, Username, Nama, Peran, Aksi, Tanggal, Detail
 *  Tanpa login: hanya bisa MELIHAT data. Hanya 3 akun (admin, sekretaris 1 & 2) yang bisa input/ubah/hapus.
 *  Password disimpan sebagai hash, bukan teks asli. */
const SPREADSHEET_ID = '1BeavE_Blf7unNcj7Zq7B5m7kPMFwLLsr';
const SEMESTER = 'Ganjil';
const SHOW_CONTACT = false;
const STUDENT_SHEET = 'Data Siswa', STUDENT_FIRST_ROW = 8;
const MONTH_FIRST_ROW = 7, FIRST_DAY_COL = 5;
const MONTHS = [
  { name: 'Agustus', n: 8, year: 2026 }, { name: 'September', n: 9, year: 2026 }, { name: 'Oktober', n: 10, year: 2026 },
  { name: 'November', n: 11, year: 2026 }, { name: 'Desember', n: 12, year: 2026 }
];
const CODES = 'HSIA-';
const USERS_SHEET = 'Akun', LOG_SHEET = 'Riwayat';
const SESSION_SECONDS = 6 * 3600, MAX_FAIL = 5, LOCK_SECONDS = 600;
const CAN_DELETE = ['admin', 'sekretaris']; // peran yang boleh menghapus absensi satu tanggal
const CAN_VIEW_LOG = ['admin'];             // peran yang boleh melihat tab Riwayat
// Akun pengurus. Isi password sendiri (min. 8 karakter), jalankan setupAkun() SEKALI, lalu HAPUS password dari baris ini.
const AKUN_AWAL = [
  { username: 'admin',       nama: 'Administrator', peran: 'admin',      password: 'GANTI_PASSWORD_ADMIN' },
  { username: 'sekretaris1', nama: 'Sekretaris 1',  peran: 'sekretaris', password: 'GANTI_PASSWORD_SEKRE1' },
  { username: 'sekretaris2', nama: 'Sekretaris 2',  peran: 'sekretaris', password: 'GANTI_PASSWORD_SEKRE2' }
];
const validCode = (s) => typeof s === 'string' && s.length === 1 && CODES.indexOf(s) >= 0;
const fail = (m) => ({ success: false, message: m });

// ================= PINTU MASUK =================
function doGet() { return out({ success: true, message: 'API Absensi Kelas aktif.' }); }

function doPost(e) {
  try {
    let b;
    try { b = JSON.parse(e.postData.contents); } catch (x) { return out(fail('Format data tidak valid.')); }
    if (b.action === 'login') return out(login(b));
    if (b.action === 'data') { // boleh tanpa login (mode lihat saja)
      const v = auth(b.token);
      return out({ success: true, user: v ? pub(v) : null, data: dashboard(!!v) });
    }
    const u = auth(b.token);
    if (!u) return out({ success: false, code: 'AUTH', message: 'Sesi berakhir, silakan login lagi.' });
    switch (b.action) {
      case 'logout': CacheService.getScriptCache().remove('s_' + b.token); return out({ success: true });
      case 'attendance': return out(locked(() => saveAttendance(b, u)));
      case 'delete': return out(locked(() => deleteAttendance(b, u)));
      case 'password': return out(locked(() => changePassword(b, u)));
      case 'log': return out(readLog(u));
      default: return out(fail('Aksi tidak dikenal.'));
    }
  } catch (err) { console.error(err); return out(fail('Terjadi kesalahan pada server.')); }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function locked(fn) { const l = LockService.getScriptLock(); l.waitLock(15000); try { return fn(); } finally { l.releaseLock(); } }

// ================= AKUN & SESI =================
function toHex(bytes) { return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join(''); }
function newSalt() { return Utilities.getUuid().replace(/-/g, ''); }
function hashPw(pw, salt) {
  let h = salt + pw;
  for (let i = 0; i < 1000; i++) h = toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  return h;
}
function usersSheet() {
  const sh = ss().getSheetByName(USERS_SHEET);
  if (!sh) throw new Error('Sheet "' + USERS_SHEET + '" belum ada. Jalankan setupAkun() dulu.');
  return sh;
}
function findUser(un) {
  const sh = usersSheet(), n = sh.getLastRow() - 1;
  if (n < 1) return null;
  const rows = sh.getRange(2, 1, n, 7).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim().toLowerCase() === un) {
      return { username: String(r[0]).trim(), name: String(r[1]).trim(), role: String(r[2]).trim().toLowerCase(),
        salt: String(r[3]), hash: String(r[4]), active: String(r[5]).trim().toUpperCase() !== 'TIDAK', row: i + 2 };
    }
  }
  return null;
}
function pub(u) {
  return { username: u.username, name: u.name, role: u.role, canDelete: CAN_DELETE.indexOf(u.role) >= 0, canLog: CAN_VIEW_LOG.indexOf(u.role) >= 0 };
}
function auth(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache(), un = cache.get('s_' + token);
  if (!un) return null;
  const u = findUser(un.toLowerCase());
  if (!u || !u.active) return null;
  cache.put('s_' + token, un, SESSION_SECONDS); // sesi diperpanjang selama dipakai
  return u;
}
function login(b) {
  const un = String(b.username || '').trim().toLowerCase().slice(0, 40), pw = String(b.password || '');
  const cache = CacheService.getScriptCache(), fk = 'f_' + un;
  if (Number(cache.get(fk) || 0) >= MAX_FAIL) return fail('Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi.');
  const u = findUser(un);
  if (!u || !u.active || hashPw(pw, u.salt) !== u.hash) {
    cache.put(fk, String(Number(cache.get(fk) || 0) + 1), LOCK_SECONDS);
    logAct(null, 'LOGIN GAGAL', '', 'username: ' + un);
    return fail('Username atau password salah.');
  }
  cache.remove(fk);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  cache.put('s_' + token, u.username, SESSION_SECONDS);
  logAct(u, 'LOGIN', '', '');
  return { success: true, token: token, user: pub(u), data: dashboard(true) };
}
function changePassword(b, u) {
  const np = String(b.newPassword || '');
  if (np.length < 8) return fail('Password baru minimal 8 karakter.');
  if (hashPw(String(b.oldPassword || ''), u.salt) !== u.hash) return fail('Password lama salah.');
  const salt = newSalt(), sh = usersSheet();
  sh.getRange(u.row, 4, 1, 2).setValues([[salt, hashPw(np, salt)]]);
  sh.getRange(u.row, 7).setValue(new Date());
  logAct(u, 'GANTI PASSWORD', '', '');
  return { success: true, message: 'Password berhasil diganti.' };
}

// ================= RIWAYAT =================
function logSheet() {
  const book = ss();
  let sh = book.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = book.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, 7).setValues([['Waktu', 'Username', 'Nama', 'Peran', 'Aksi', 'Tanggal Absensi', 'Detail']]).setFontWeight('bold');
    sh.getRange('A2:A5000').setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sh.getRange('F2:F5000').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}
function logAct(u, aksi, tanggal, detail) {
  logSheet().appendRow([new Date(), u ? u.username : '-', u ? u.name : '-', u ? u.role : '-', aksi, tanggal || '', String(detail || '').slice(0, 1000)]);
}
function readLog(u) {
  if (CAN_VIEW_LOG.indexOf(u.role) < 0) return fail('Akun ini tidak boleh melihat riwayat.');
  const sh = logSheet(), n = Math.min(300, sh.getLastRow() - 1);
  return { success: true, log: n > 0 ? sh.getRange(sh.getLastRow() - n + 1, 1, n, 7).getDisplayValues().reverse() : [] };
}

// ================= DATA =================
function readStudents(withContact) {
  const sh = ss().getSheetByName(STUDENT_SHEET);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + STUDENT_SHEET);
  const rows = sh.getRange(STUDENT_FIRST_ROW, 1, Math.max(sh.getLastRow() - STUDENT_FIRST_ROW + 1, 1), 7).getDisplayValues();
  return rows.filter((r) => String(r[2]).trim()).map((r) => {
    const s = { no: Number(r[0]), nis: String(r[1]).trim(), name: String(r[2]).trim(), lp: String(r[3]).trim() };
    if (SHOW_CONTACT && withContact) { s.hp = r[4]; s.ortu = r[5]; s.hpOrtu = r[6]; }
    return s;
  });
}
function readMonth(mo, n) {
  const days = new Date(mo.year, mo.n, 0).getDate(), res = { name: mo.name, n: mo.n, year: mo.year, days: days, grid: {} };
  const sh = ss().getSheetByName('Absen ' + mo.name);
  if (!sh) { res.missing = true; return res; }
  const keys = sh.getRange(MONTH_FIRST_ROW, 2, n, 1).getDisplayValues();
  const vals = sh.getRange(MONTH_FIRST_ROW, FIRST_DAY_COL, n, days).getValues();
  keys.forEach((k, i) => {
    res.grid[String(k[0]).trim()] = vals[i].map((v) => { v = String(v).trim().toUpperCase(); return validCode(v) ? v : '.'; }).join('');
  });
  return res;
}
function dashboard(withContact) {
  const students = readStudents(withContact), info = ss().getSheetByName(STUDENT_SHEET).getRange('A2:B6').getDisplayValues();
  return { subtitle: info[0][0], className: info[2][1], wali: info[3][1], nip: info[4][1], semester: SEMESTER,
    students: students, months: MONTHS.map((mo) => readMonth(mo, students.length)) };
}

// ================= ABSENSI (input & hapus, semuanya dicatat) =================
function dayRef(b) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.date));
  if (!m) return { err: 'Tanggal tidak valid.' };
  const y = +m[1], mon = +m[2], d = +m[3];
  const mo = MONTHS.filter((x) => x.n === mon && x.year === y)[0];
  if (!mo) return { err: 'Bulan ini tidak ada di daftar sheet absensi.' };
  if (d < 1 || d > new Date(y, mon, 0).getDate()) return { err: 'Tanggal tidak valid.' };
  const sh = ss().getSheetByName('Absen ' + mo.name);
  if (!sh) return { err: 'Sheet "Absen ' + mo.name + '" tidak ditemukan.' };
  const st = readStudents(), n = st.length, names = {};
  st.forEach((s) => (names[s.nis] = s.name));
  const keys = sh.getRange(MONTH_FIRST_ROW, 2, n, 1).getDisplayValues().map((k) => String(k[0]).trim());
  const rng = sh.getRange(MONTH_FIRST_ROW, FIRST_DAY_COL + d - 1, n, 1), raw = rng.getValues();
  const cur = raw.map((r) => { const v = String(r[0]).trim().toUpperCase(); return validCode(v) ? v : ''; });
  return { rng: rng, raw: raw, keys: keys, cur: cur, names: names };
}
function rekap(codes) {
  const c = { H: 0, S: 0, I: 0, A: 0, '-': 0 };
  codes.forEach((x) => { if (c[x] !== undefined) c[x]++; });
  return 'Hadir ' + c.H + ', Sakit ' + c.S + ', Izin ' + c.I + ', Alfa ' + c.A + (c['-'] ? ', Libur ' + c['-'] : '');
}
function tidakHadir(keys, codes, names) {
  const l = [];
  codes.forEach((x, i) => { if (x === 'S' || x === 'I' || x === 'A') l.push((names[keys[i]] || keys[i]) + ' (' + x + ')'); });
  return l.length ? ' | Tidak hadir: ' + l.join(', ') : '';
}
function saveAttendance(b, u) {
  const r = dayRef(b);
  if (r.err) return fail(r.err);
  const map = {};
  (b.entries || []).forEach((e) => { if (validCode(e.status)) map[String(e.nis)] = e.status; });
  const existed = r.cur.some(Boolean), diffs = [];
  let changed = 0;
  const nv = r.keys.map((k, i) => {
    const s = map[k];
    if (!s) return r.raw[i];
    changed++;
    if (r.cur[i] !== s) diffs.push((r.names[k] || k) + ': ' + (r.cur[i] || 'kosong') + '→' + s);
    return [s];
  });
  if (!changed) return fail('Tidak ada data absensi untuk disimpan.');
  if (existed && !diffs.length) return { success: true, message: 'Tidak ada perubahan.', data: dashboard(true) };
  r.rng.setValues(nv);
  const now = r.keys.map((k, i) => map[k] || r.cur[i]);
  logAct(u, existed ? 'UBAH' : 'INPUT', b.date, rekap(now) + (existed ? ' | Perubahan: ' + diffs.join(', ') : tidakHadir(r.keys, now, r.names)));
  return { success: true, message: 'Absensi tersimpan ke sheet.', data: dashboard(true) };
}
function deleteAttendance(b, u) {
  if (CAN_DELETE.indexOf(u.role) < 0) return fail('Akun ini tidak boleh menghapus absensi.');
  const r = dayRef(b);
  if (r.err) return fail(r.err);
  if (!r.cur.some(Boolean)) return fail('Tidak ada data absensi pada tanggal ini.');
  r.rng.clearContent();
  logAct(u, 'HAPUS', b.date, 'Sebelumnya: ' + rekap(r.cur) + tidakHadir(r.keys, r.cur, r.names));
  return { success: true, message: 'Absensi tanggal tersebut dihapus.', data: dashboard(true) };
}

// ================= SETUP (dijalankan manual dari editor Apps Script) =================
function validPw(p) { return typeof p === 'string' && p.length >= 8 && p.indexOf('GANTI_') !== 0; }
/** Jalankan SEKALI setelah mengisi AKUN_AWAL. Membuat sheet Akun berisi tepat akun-akun di AKUN_AWAL.
 *  Setelah berhasil, HAPUS password dari kode lalu Save. Tidak ada cara membuat akun lewat website. */
function setupAkun() {
  const bad = AKUN_AWAL.filter((a) => !validPw(a.password));
  if (bad.length) { Logger.log('Password belum diisi/kurang dari 8 karakter untuk: ' + bad.map((a) => a.username).join(', ')); return; }
  const book = ss();
  let sh = book.getSheetByName(USERS_SHEET);
  if (!sh) sh = book.insertSheet(USERS_SHEET);
  logSheet();
  if (sh.getLastRow() > 1) { Logger.log('Sheet Akun sudah berisi. Untuk ganti password pakai tab Akun di website atau resetPassword().'); return; }
  sh.getRange(1, 1, 1, 7).setValues([['Username', 'Nama', 'Peran', 'Salt', 'Hash', 'Aktif', 'Terakhir Ganti Password']]).setFontWeight('bold');
  sh.getRange('D2:E50').setNumberFormat('@');
  const rows = AKUN_AWAL.map((a) => { const salt = newSalt(); return [a.username.trim(), a.nama, a.peran, salt, hashPw(a.password, salt), 'YA', new Date()]; });
  sh.getRange(2, 1, rows.length, 7).setValues(rows);
  sh.setFrozenRows(1);
  Logger.log('Selesai: ' + rows.length + ' akun dibuat (' + rows.map((r) => r[0]).join(', ') + '). SEKARANG hapus password dari AKUN_AWAL lalu Save.');
}
/** Lupa password: isi username & password baru di bawah, Run, lalu hapus password dari baris tsb. */
function resetPassword() {
  const username = 'sekretaris1', passwordBaru = 'GANTI_PASSWORD_BARU'; // <-- ubah
  if (!validPw(passwordBaru)) { Logger.log('Isi passwordBaru (min. 8 karakter).'); return; }
  const u = findUser(username.toLowerCase());
  if (!u) { Logger.log('Username tidak ditemukan: ' + username); return; }
  const salt = newSalt(), sh = usersSheet();
  sh.getRange(u.row, 4, 1, 2).setValues([[salt, hashPw(passwordBaru, salt)]]);
  sh.getRange(u.row, 7).setValue(new Date());
  logAct({ username: 'sistem', name: 'Reset manual', role: '-' }, 'RESET PASSWORD', '', 'Akun: ' + username);
  Logger.log('Password ' + username + ' diganti. Hapus passwordBaru dari kode lalu Save.');
}
