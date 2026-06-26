import ExpressApplication from "./app.js";
import logger from "./utils/logger.js";
// import serverless from "serverless-http";

const PORT = process.env.PORT || 3000;

// if (process.env.IS_NETLIFY !== "true") {
// }
const app = new ExpressApplication(PORT);
const server = await app.start();

process.on("SIGTERM", () => {
  logger.warn("SIGTERM RECEIVED!");
  server.close(() => {
    logger.warn("Process Terminated!");
  });
});
