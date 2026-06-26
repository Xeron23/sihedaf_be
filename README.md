# Sihedaf Backend

Backend API untuk aplikasi Sihedaf (Sistem Kesehatan Berbasis IoT). Project ini dibangun dengan **Express 5**, **Prisma**, dan **MySQL**, serta terintegrasi dengan **MQTT** untuk streaming data real-time dari smartwatch IoT dan **Firebase Cloud Messaging (FCM)** untuk notifikasi push.

## Fitur Utama

- **Authentication & Authorization**
  - Register, Login, Logout pengguna.
  - JWT Token based authentication.
- **IoT & Measurement**
  - Integrasi MQTT Broker (Mosquitto) untuk komunikasi *real-time* dua arah antara aplikasi dan smartwatch.
  - Streaming pengukuran *Heart Rate* (Detak Jantung) dan *Blood Oxygen* (Saturasi Oksigen/SpO2).
  - Menyimpan hasil pengukuran akhir ke database (MySQL).
- **Notification**
  - Push notification menggunakan Firebase Cloud Messaging (FCM).
  - Manajemen FCM token untuk pengguna (update token, delete token saat logout).

---

## Tech Stack

- **Runtime**: Node.js 24
- **Framework**: Express 5
- **Database**: MySQL
- **ORM**: Prisma
- **Validation**: Joi
- **Auth**: JWT + bcrypt
- **IoT / Streaming**: MQTT (Mosquitto Broker via Cloudflare Tunnel)
- **Push Notification**: Firebase Admin SDK
- **Testing**: Jest + Supertest

---

## Project Structure

```bash
src/
  app.js
  server.js
  base_classes/
  config/
    cors.js
    db.js
    firebase.js
    mqtt.js
    socket.js
  domains/
    auth/
    iot/
    measurement/
    notification/
  middlewares/
  utils/
prisma/
  schema.prisma
  seed.js
```

---

## Environment Variables

Minimal environment yang perlu disiapkan:

```env
PORT=4003
NODE_ENV=development

# Database Configuration
DATABASE_URL=mysql://root:password@localhost:3306/sihedaf_db

# JWT Configuration
JWT_SECRET=your_jwt_secret

# MQTT Configuration
MQTT_BROKER_URL=wss://iot-broker.xianly.cloud
MQTT_USERNAME=your_mqtt_user
MQTT_PASSWORD=your_mqtt_password

# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/your/firebase-adminsdk.json

# URLs
FE_URL=http://localhost:3000
BE_URL=http://localhost:4003
```

> **Catatan**: Jika mendeploy dengan Docker, pastikan environment path (seperti Firebase path) sesuai dengan mounting volume di container.

---

## Installation

```bash
npm install
```

### Generate Prisma Client
```bash
npx prisma generate
```

### Run Migration
```bash
npx prisma migrate deploy
```

---

## Running the App

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

---

## MQTT Architecture (IoT Handoff)

Aplikasi ini menggunakan sistem "Idle Connection" untuk efisiensi baterai pada *smartwatch*.

1. **Watch to Backend (Idle):** Watch selalu terhubung ke broker, tapi tidak mengirim data apapun (idle).
2. **App Trigger:** HTTP API mem-publish pesan ke topik `/watch/trigger` (`START` atau `STOP`).
3. **Streaming:** Jika menerima `START`, smartwatch mulai mengirimkan data *heart rate* & *blood oxygen* secara kontinyu ke `/watch/stream`.
4. **Backend Processing:** Backend mendengarkan `/watch/stream` via MQTT subscriber internal.
5. **Final Save:** Saat trigger `STOP` dikirim, hasil akhir (*Summary*) disimpan ke database melalui *domain Measurement*.

Untuk panduan lengkap integrasi hardware, silakan merujuk ke file `IOT_HANDBOOK.txt` di root repository.

---

## CI/CD Pipeline

Pipeline otomatis dengan **GitHub Actions** (`deploy.yaml`):
1. **Test Job**: Menjalankan *unit test* dan mengecek dependency.
2. **Deploy Job**: Jika test berhasil, GitHub Action akan melakukan remote SSH ke VPS.
3. VPS melakukan Git Pull, membuild ulang Docker Image, lalu restart Docker Container dengan mem-passing secret credentials terbaru.

---

## Useful Commands

```bash
# generate prisma client
npx prisma generate

# migrate database
npx prisma migrate deploy

# run unit tests
npm test
```
