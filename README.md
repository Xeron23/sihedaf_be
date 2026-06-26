# Chain Fit Backend

Backend API untuk aplikasi manajemen gym dan membership. Project ini dibangun dengan **Express 5**, **Prisma**, dan **MySQL**, serta terintegrasi dengan **Midtrans** untuk pembayaran dan **MinIO / S3-compatible storage** untuk upload image.

## Fitur Utama

- **Authentication & Authorization**
  - Register member dan owner
  - Login, refresh token, reset password
  - Role-based access: `ADMIN`, `OWNER`, `PENJAGA`, `MEMBER`
- **Gym Management**
  - Create, update, delete gym
  - Upload image gym
  - Verifikasi gym oleh admin
- **Membership**
  - Membership package (paket member)
  - Membership create / update / delete
  - Membership history per member / gym
- **Attendance**
  - Generate attendance token / QR flow
  - Check-in dan check-out member
  - Attendance history
- **Equipment**
  - CRUD equipment gym
  - Equipment history (kerusakan / perbaikan)
- **Cashflow**
  - Pemasukan / pengeluaran gym
  - Search, detail, update, soft delete
- **Transaction & Payment**
  - Create Midtrans Snap transaction
  - Midtrans webhook handling
  - Membership + cashflow side effect setelah payment sukses
- **Scheduler**
  - Background job via `node-cron`

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express 5
- **Database**: MySQL
- **ORM**: Prisma
- **Validation**: Joi
- **Auth**: JWT + bcrypt
- **Payments**: Midtrans
- **Object Storage**: MinIO / S3-compatible
- **Email**: Nodemailer
- **Testing**: Jest + Supertest

---

## Project Structure

```bash
src/
  app.js
  server.js
  base_classes/
  config/
  domains/
    attendance/
    auth/
    equipment/
    gym/
    membership_paket/
    transaction/
  jobs/
  middlewares/
  utils/
prisma/
  schema.prisma
  seed.js
tests/
  helpers/
  integration/
```

---

## Database Models

Beberapa model utama di schema Prisma:

- `User`
- `Gym`
- `GymImage`
- `MembershipPackage`
- `Membership`
- `Attendance`
- `Transaction`
- `Equipment`
- `EquipmentHistory`
- `GymCashflow`
- `SystemLog`

---

## Environment Variables

Minimal environment yang perlu disiapkan:

### App & Auth

```env
PORT=4002
JWT_SECRET=your_jwt_secret
FE_URL=http://localhost:3000
BE_URL=http://localhost:4002
```

### Database

```env
DATABASE_URL=mysql://user:password@host:3306/gym_be
```

### MinIO / S3

```env
IS3_END_POINT=http://127.0.0.1:9000
IS3_REGION=us-east-1
IS3_ACCESS_KEY_ID=minioadmin
IS3_SECRET_ACCESS_KEY_ID=minioadmin
IS3_BUCKET_NAME=chain-fit
IS3_PREFIX=gym-media
```

### Midtrans

```env
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_IS_PRODUCTION=false
```

### Email

```env
EMAIL_USERNAME=your_email_username
EMAIL_PASSWORD=your_email_password
```

> Pastikan `DATABASE_URL` mengarah ke database yang benar sesuai environment. Untuk integration test, gunakan database test terpisah.

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

### Seed Database

```bash
npx prisma db seed
```

---

## Running the App

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

---

## Testing

Project ini sudah dipisah antara **unit test**, **service integration test**, dan **HTTP integration test**.

### Unit test only

```bash
npm test
```

### All integration tests

```bash
npm run test:integration
```

### Service / DB integration only

```bash
npm run test:integration:service
```

### HTTP integration only

```bash
npm run test:integration:http
```

### Current Coverage Snapshot

- **Unit tests**: controller-level unit tests
- **Integration tests**:
  - auth
  - gym
  - gym create/upload
  - role access
  - membership
  - paket member
  - gym staff / penjaga
  - transaction
  - cashflow
  - attendance
  - equipment

> HTTP integration tests menggunakan **Supertest** dan sebagian flow upload menggunakan **MinIO real/sandbox**.

---

## CI / Deploy Flow

Workflow deploy sudah disusun berurutan:

1. **Unit test**
2. **Service integration test**
3. **HTTP integration test**
4. **Deploy ke VPS**

Deploy dilakukan via GitHub Actions dan SSH ke VPS.

---

## API Domain Overview

### Auth
- register / login / refresh token
- profile update
- password update / reset password

### Gym
- create / update / delete gym
- list gym
- admin verification

### Membership
- membership package
- membership management
- active membership lookup

### Attendance
- token generation
- check-in / check-out
- history

### Equipment
- equipment CRUD
- equipment history

### Cashflow
- create / list / detail / update / soft delete

### Transaction
- create snap transaction
- Midtrans webhook

---

## Notes

- Integration tests memerlukan resource test yang terpisah dari production, terutama untuk:
  - **database test**
  - **bucket MinIO test**
- Untuk upload test, bucket test sebaiknya dipisahkan dari bucket production.
- Role access dan ownership access adalah bagian penting di project ini, jadi perubahan route sebaiknya selalu diikuti update test.

---

## Useful Commands

```bash
# generate prisma client
npx prisma generate

# migrate database
npx prisma migrate deploy

# run seed
npx prisma db seed

# run unit tests
npm test

# run all integration tests
npm run test:integration

# run service integration only
npm run test:integration:service

# run http integration only
npm run test:integration:http
```

---

## Status

Backend ini sudah melewati tahap CRUD sederhana dan sudah mencakup:

- multi-role authorization
- payment integration
- object storage integration
- scheduler
- layered automated testing

Jadi project ini sudah masuk kategori **real-world backend dengan kompleksitas menengah**.
