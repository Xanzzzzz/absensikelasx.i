# Absensi Kelas X-I
Frontend (HTML/CSS/JS) → Google Apps Script Web App → Google Sheets.
Website membaca dan menulis **langsung ke sheet absen yang sudah ada** (tanpa sheet tambahan).

## Sheet yang dibaca (nama harus persis)
| Sheet | Dipakai |
|---|---|
| `Data Siswa` | A2 sekolah/TA, B4 kelas, B5 wali kelas; baris 8+: No, NIS, Nama, L/P (HP hanya jika `SHOW_CONTACT = true`) |
| `Absen Agustus` … `Absen Desember` | Baris 7+: kolom A–D identitas, E dst = tanggal 1–31. Isi: `H` `S` `I` `A` `-` (libur) |

Sheet `Rekap Semester` dan kolom rekap (H/S/I/A/%) di sheet bulanan **tidak dibaca**; semua dihitung ulang dari isi kotak tanggal. Menyimpan absensi di website menulis huruf ke kolom tanggal yang sesuai (menimpa isi tanggal itu).

## Siapa yang bisa apa
- **Tanpa login (siapa saja yang punya link):** hanya **melihat** (Dashboard, Bulanan, Semester, Siswa).
- **3 akun pengurus** (`admin`, `sekretaris1`, `sekretaris2`, dibuat sendiri): input, ubah, dan hapus absensi. Hanya admin yang bisa melihat tab **Riwayat**.
- Tidak ada pendaftaran lewat website. Akun hanya yang ada di sheet `Akun`.
- Setiap LOGIN, LOGIN GAGAL, INPUT, UBAH (siapa berubah dari apa ke apa), HAPUS, dan GANTI PASSWORD dicatat di sheet `Riwayat`. Login dikunci 10 menit setelah 5 kali salah; sesi habis setelah 6 jam tidak aktif.
- Ubah hak di `Code.gs`: `CAN_DELETE` dan `CAN_VIEW_LOG`.

### Membuat 3 akun (sekali)
1. Di `Code.gs`, isi `AKUN_AWAL`: username, nama, dan **password** masing-masing (min. 8 karakter). Save.
2. Dropdown fungsi → **`setupAkun`** → Run (izinkan akses). Di Execution log harus muncul "3 akun dibuat".
3. **Hapus password dari `AKUN_AWAL`** (kembalikan jadi `GANTI_...`) lalu Save.
4. Deploy ulang: **Manage deployments → pensil → New version → Deploy**.
5. Buka web, klik **Masuk**, lalu ganti password di tab **Akun** (password hanya kamu yang tahu).
6. Kunci sheet `Akun` dan `Riwayat`: klik kanan tab sheet → Protect sheet → hanya pemilik.

Lupa password: ubah `username` dan `passwordBaru` di fungsi **`resetPassword`**, Run, lalu hapus passwordnya dari kode.

Catatan: perubahan yang dilakukan langsung di spreadsheet (bukan lewat web) tidak masuk `Riwayat`; lihat **File → Version history** di Google Sheets. No. HP siswa hanya dikirim ke akun yang login, dan hanya jika `SHOW_CONTACT = true`.

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
- **Privasi:** karena mode lihat tidak perlu login, siapa pun yang punya link bisa melihat nama dan kehadiran siswa. Bagikan link hanya ke yang berkepentingan.

## Logo sekolah
Taruh file logo bernama `logo.png` (persegi, disarankan 256×256 px) di folder yang sama dengan `index.html`. Logo otomatis tampil di pojok kiri atas dan sebagai ikon tab browser. Kalau file belum ada, yang tampil ikon bawaan.
