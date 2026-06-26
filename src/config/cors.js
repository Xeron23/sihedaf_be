const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:56514",
    "https://chain-fit-web-admin.vercel.app",
    "https://chain-fit-web.vercel.app"
];

// const corsOptions = {
//     origin: function (origin, callback) {
//         if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//         } else {
//         callback(new Error("Not allowed by CORS"));
//         }
//     },
//     credentials: true,
// };

// export default corsOptions;


const corsOptions = {
  origin(origin, callback) {
    // non-browser client (Flutter mobile, Postman, curl) biasanya tidak punya Origin
    if (!origin) return callback(null, true);

    // exact whitelist
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // dev: allow any localhost port (Flutter Web biasanya random)
    if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return callback(null, true);

    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

export default corsOptions;
