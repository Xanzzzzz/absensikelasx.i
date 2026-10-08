/** Absensi Kelas - Google Apps Script API
 *  Membaca & menulis langsung ke sheet yang sudah ada:
 *  "Data Siswa"   : baris 8+ -> A=No, B=NIS, C=Nama, D=L/P, E=HP Siswa, F=Orang Tua, G=HP Ortu (B4=Kelas, B5=Wali, B6=NIP, A2=Sekolah/TA)
 *  "Absen <Bulan>": baris 7+ -> A=No, B=NIS, C=Nama, D=L/P, E..=tanggal 1..31 (isi H/S/I/A/-)
 *  Semua rekap dihitung di website dari isi kotak tanggal; sheet "Rekap Semester" dan kolom rekap di sheet bulan tidak dibaca. */
const SPREADSHEET_ID = '1BeavE_Blf7unNcj7Zq7B5m7kPMFwLLsr';
const SEMESTER = 'Ganjil';
const SHOW_CONTACT = false; // true = tampilkan No. HP siswa & orang tua di website (data pribadi, hati-hati)
const STUDENT_SHEET = 'Data Siswa', STUDENT_FIRST_ROW = 8;
const MONTH_FIRST_ROW = 7, FIRST_DAY_COL = 5; // E = tanggal 1
const MONTHS = [
  { name: 'Agustus', n: 8, year: 2026 }, { name: 'September', n: 9, year: 2026 }, { name: 'Oktober', n: 10, year: 2026 },
  { name: 'November', n: 11, year: 2026 }, { name: 'Desember', n: 12, year: 2026 }
];
const CODES = 'HSIA-';
const validCode = (s) => typeof s === 'string' && s.length === 1 && CODES.indexOf(s) >= 0;

function doGet() {
  try { return out({ success: true, data: dashboard() }); }
  catch (err) { console.error(err); return out({ success: false, message: 'Terjadi kesalahan pada server: ' + err.message }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    let b;
    try { b = JSON.parse(e.postData.contents); } catch (x) { return out({ success: false, message: 'Format data tidak valid.' }); }
    if (!b || b.action !== 'attendance') return out({ success: false, message: 'Aksi tidak dikenal.' });
    const err = saveAttendance(b);
    if (err) return out({ success: false, message: err });
    return out({ success: true, message: 'Absensi tersimpan ke sheet.', data: dashboard() });
  } catch (err) {
    console.error(err);
    return out({ success: false, message: 'Terjadi kesalahan pada server.' });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function readStudents() {
  const sh = ss().getSheetByName(STUDENT_SHEET);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + STUDENT_SHEET);
  const rows = sh.getRange(STUDENT_FIRST_ROW, 1, Math.max(sh.getLastRow() - STUDENT_FIRST_ROW + 1, 1), 7).getDisplayValues();
  return rows.filter((r) => String(r[2]).trim()).map((r) => {
    const s = { no: Number(r[0]), nis: String(r[1]).trim(), name: String(r[2]).trim(), lp: String(r[3]).trim() };
    if (SHOW_CONTACT) { s.hp = r[4]; s.ortu = r[5]; s.hpOrtu = r[6]; }
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
    // hanya H/S/I/A/- yang dihitung; sel kosong atau rumus nyasar dianggap kosong ('.')
    res.grid[String(k[0]).trim()] = vals[i].map((v) => { v = String(v).trim().toUpperCase(); return validCode(v) ? v : '.'; }).join('');
  });
  return res;
}

function dashboard() {
  const students = readStudents(), sh = ss().getSheetByName(STUDENT_SHEET);
  const info = sh.getRange('A2:B6').getDisplayValues();
  return {
    subtitle: info[0][0], className: info[2][1], wali: info[3][1], nip: info[4][1], semester: SEMESTER,
    students: students, months: MONTHS.map((mo) => readMonth(mo, students.length))
  };
}

function saveAttendance(b) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.date));
  if (!m) return 'Tanggal tidak valid.';
  const y = +m[1], mon = +m[2], d = +m[3];
  const mo = MONTHS.filter((x) => x.n === mon && x.year === y)[0];
  if (!mo) return 'Bulan ini tidak ada di daftar sheet absensi.';
  if (d < 1 || d > new Date(y, mon, 0).getDate()) return 'Tanggal tidak valid.';
  const sh = ss().getSheetByName('Absen ' + mo.name);
  if (!sh) return 'Sheet "Absen ' + mo.name + '" tidak ditemukan.';
  const n = readStudents().length, map = {};
  (b.entries || []).forEach((e) => { if (validCode(e.status)) map[String(e.nis)] = e.status; });
  const keys = sh.getRange(MONTH_FIRST_ROW, 2, n, 1).getDisplayValues();
  const rng = sh.getRange(MONTH_FIRST_ROW, FIRST_DAY_COL + d - 1, n, 1), cur = rng.getValues();
  let changed = 0;
  const nv = keys.map((k, i) => { const s = map[String(k[0]).trim()]; if (s) { changed++; return [s]; } return cur[i]; });
  if (!changed) return 'Tidak ada data absensi untuk disimpan.';
  rng.setValues(nv);
  return null;
}
