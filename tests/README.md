# Integration Test Scaffold

Folder ini dipakai untuk integration test berbasis database sandbox (`gym_be_test`).

Struktur awal:
- `helpers/db-test-helper.js` → koneksi test DB + cleanup data
- `helpers/seed-factory.js` → helper seed data relasional
- `integration/*.int.test.js` → test integration per flow/domain

Catatan:
- Test ini ditujukan ke DB sandbox, bukan database utama.
- Pastikan migration Prisma sudah dijalankan ke `gym_be_test` sebelum mengeksekusi suite ini.
