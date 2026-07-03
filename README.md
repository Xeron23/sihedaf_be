# Sihedaf Backend

Sistem Backend API untuk aplikasi **Sihedaf** (Sistem Kesehatan Pintar Berbasis IoT). Dibangun menggunakan **Express 5**, **Prisma**, dan **MySQL**. Repositori ini bertanggung jawab untuk menangani Autentikasi Pengguna, Integrasi Hardware IoT (Jam Pintar), Analisis Data Medis (Deteksi AFib), dan Notifikasi *In-App*.

---

## 🚀 Fitur Utama

- **Authentication & Authorization**
  - Register, Login, Profil User.
  - Autentikasi berbasis *JWT Token* (Access & Refresh Token).
- **IoT & Measurement (HTTP State Machine)**
  - Komunikasi Jam Pintar berbasis *HTTP Polling* (Hemat Baterai & Bebas Blokir Firewall RS).
  - Perekaman sinyal PPG (*Photoplethysmography*) secara bertahap / *Append Chunk*.
  - Skenario pembatalan *(Interruption)* secara *Real-time*.
  - *Broadcast WebSocket* ke sisi Frontend/Mobile untuk menampilkan Grafik *Live*.
- **Medical AI Integration (Placeholder)**
  - Meneruskan 180 detik *Dataset* utuh ke modul AI untuk analisis *Atrial Fibrillation (AF)*.
- **In-App Notification**
  - Penyampaian status hasil pengukuran (Normal / Peringatan Medis) ke Database Notifikasi *real-time*.

---

## 🛠 Tech Stack

- **Runtime**: Node.js 24
- **Framework**: Express 5
- **Database**: MySQL 8.4
- **ORM**: Prisma
- **Validation**: Joi
- **Auth**: JWT + bcrypt
- **Real-Time Graph**: Socket.io
- **CI/CD**: GitHub Actions & Docker

---

## 📂 Project Structure

Arsitektur aplikasi ini menggunakan pendekatan **Domain-Driven Design (Layered)** untuk kemudahan pemeliharaan:

```bash
src/
  app.js                 # Entry point Express
  server.js              # Entry point Server
  base_classes/          # Template Base Controller & Route
  config/                # Setup Database & Socket.io
  domains/               # Modul Utama (Domain)
    auth/                # Logic Autentikasi User
    iot/                 # Logic Polling & Submit dari Hardware Jam
    measurement/         # Logic Pasien (Bind, Start, Stop)
    notification/        # Logic Alert & Riwayat
  middlewares/           # Interceptor (Global Error, JWT Check)
  utils/                 # Helper Functions (Response, dll)
prisma/
  schema.prisma          # Skema Tabel MySQL
```

---

## ⚙️ Environment Variables

Minimal environment yang perlu disiapkan di `.env`:

```env
PORT=4004
NODE_ENV=development

# Database Configuration
DATABASE_URL=mysql://<user>:<password>@<host>:<port>/sihedaf_be

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key

# URLs
FE_URL=http://localhost:3000
BE_URL=http://localhost:4004
```

> **Catatan Docker**: Jika mendeploy menggunakan GitHub Actions, koneksi *database* secara internal memanggil nama *container* (misal: `mysql://root:pass@mysql-container:3306/sihedaf_be`).

---

## 📡 IoT Architecture (HTTP REST)

Sistem lama yang menggunakan MQTT telah digantikan dengan **Murni HTTP REST** menggunakan metode *State Machine*. Alur ini menjamin stabilitas koneksi di lingkungan rumah sakit.

1. **State 1 (IDLE):** Jam Pintar mengirim `GET /api/v1/iot/device/<MAC>/poll` setiap 5 detik untuk mengecek tugas.
2. **State 2 (MEASURING):** Jika Web mengirimkan perintah `START`, respons Polling akan berubah. Jam langsung menyalakan sensor.
3. **State 3 (SUBMITTING):** Jam mengirim cicilan data PPG (`POST /submit`) setiap **2 detik**.
4. **State 4 (FINISH / STOP):** Setelah genap 3 menit, Jam mengirim flag `isFinished: true`. Backend menyatukan seluruh dataset dan mengeksekusi model AI.

📚 **Panduan Lengkap untuk Firmware Engineer:** Silakan merujuk pada dokumen [`IoT_HTTP_Handbook_Updated.txt`](./IoT_HTTP_Handbook_Updated.txt) di root repositori.

---

## 📦 Instalasi & Menjalankan (Lokal)

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npx prisma generate

# 3. Sinkronisasi Database
npx prisma db push

# 4. Jalankan Server
npm run dev
```

---

## 🚀 CI/CD Pipeline (GitHub Actions)

Repositori ini telah terintegrasi dengan Pipeline otomatis yang tertanam di `.github/workflows/deploy.yaml`. 
- Setiap kali Anda melakukan `git push` atau `merge` ke *branch* `dev` (atau `main`), GitHub Actions akan terpicu.
- Action akan masuk (SSH) ke dalam VPS Server, menarik kode terbaru, membangun ulang *image* Docker, dan menyalakan kontainer secara otomatis di *background*.
