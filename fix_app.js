const fs = require('fs');
let code = fs.readFileSync('src/app.js', 'utf8');

// Di Express, errorHandler harus di daftarkan SETELAH routes. 
// Di app.js saat ini: this.setupMiddlewares([ errorHandler, express.json(), ... ])
// Itu salah besar.

// Kita akan menghapus errorHandler dari setupMiddlewares, dan memindahkannya ke bawah setupRoute.
code = code.replace(
  /this\.setupMiddlewares\(\[\s*errorHandler,\s*express\.json\(\),\s*express\.urlencoded\(\),\s*apicache\.middleware\("5 minutes"\),\s*\]\);/,
  `this.setupMiddlewares([
            express.json(),
            express.urlencoded(),
            apicache.middleware("5 minutes"),
        ]);
        this.app.use(errorHandler); // <-- Dipindah ke sini (SETELAH middleware lainnya & routes)`
);

// Dan karena this.setupRoute() dipanggil SEBELUM setupMiddlewares di constructor saat ini:
// this.setupRoute();
// this.setupMiddlewares([...]);
// Kita pastikan app.use(errorHandler) ada di akhir.

fs.writeFileSync('src/app.js', code);
