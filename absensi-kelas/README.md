# Absensi Kelas X-I
Frontend (HTML/CSS/JS) → Google Apps Script Web App → Google Sheets.
Website membaca dan menulis **langsung ke sheet absen yang sudah ada** (tanpa sheet tambahan).

## Sheet yang dibaca (nama harus persis)
| Sheet | Dipakai |
|---|---|
| `Data Siswa` | A2 sekolah/TA, B4 kelas, B5 wali kelas; baris 8+: No, NIS, Nama, L/P (HP hanya jika `SHOW_CONTACT = true`) |
| `Absen Agustus` … `Absen Desember` | Baris 7+: kolom A–D identitas, E dst = tanggal 1–31. Isi: `H` `S` `I` `A` `-` (libur) |

Sheet `Rekap Semester` dan kolom rekap (H/S/I/A/%) di sheet bulanan **tidak dibaca**; semua dihitung ulang dari isi kotak tanggal. Menyimpan absensi di website menulis huruf ke kolom tanggal yang sesuai (menimpa isi tanggal itu).

## Menghubungkan
1. Pastikan file di Google Drive berformat **Google Sheets** (bukan .xlsx). Kalau masih Excel: File → **Save as Google Sheets**, lalu pakai ID yang baru.
2. **Extensions → Apps Script**, ganti isi `Code.gs` dengan `google-apps-script/Code.gs`. Cek `SPREADSHEET_ID`. **Save**.
3. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone** → Deploy → Authorize → salin URL `/exec`.
4. Tempel URL ke `CONFIG.API_URL` di `script.js`, lalu buka `index.html`.
5. Tes: status "Terhubung", buka tab Bulanan (isi harus sama dengan sheet), simpan absensi satu tanggal, cek kotak tanggalnya di sheet.

Edit `Code.gs` lagi? **Deploy → Manage deployments → pensil → New version → Deploy** (URL tetap).

## Catatan
- Bulan di `MONTHS` (Code.gs) = sheet yang tersedia. Untuk semester genap, tambah sheet `Absen Januari` dst. dan daftarnya.
- % kehadiran = H ÷ (H+S+I+A); `-` dan kotak kosong tidak dihitung. Di bawah 75% ditandai "Rendah" (`CONFIG.LOW`).
- Tanggal yang dianggap hari efektif = ada minimal satu siswa berisi H/S/I/A.
- **Privasi:** Web App "Anyone" berarti siapa pun yang punya URL bisa melihat nama dan kehadiran siswa serta mengirim data. Rahasiakan URL. No. HP sengaja disembunyikan secara default.

## Logo sekolah
Taruh file logo bernama `logo.png` (persegi, disarankan 256×256 px) di folder yang sama dengan `index.html`. Logo otomatis tampil di pojok kiri atas dan sebagai ikon tab browser. Kalau file belum ada, yang tampil ikon bawaan.
