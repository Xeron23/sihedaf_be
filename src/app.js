import "dotenv/config";

import { __dirname, __filename } from "./utils/path.js";
import apicache from "apicache";
import compression from "compression";
import cors from "cors";
import errorHandler from "./middlewares/error-handler-middleware.js";
import express from "express";
import helmet from "helmet";
import logger from "./utils/logger.js";
import morgan from "morgan";
import multer from "multer";
import path from "path";
import http from "http";

import prisma from "./config/db.js";
import corsOptions from "./config/cors.js";
import AuthRoutes from "./domains/auth/auth-routes.js";
import MeasurementRoutes from "./domains/measurement/measurement.route.js";
import NotificationRoutes from "./domains/notification/notification.route.js";
import IotRoutes from "./domains/iot/iot.route.js";
import { initSocket } from "./config/socket.js";
import { initMqtt } from "./config/mqtt.js";

class ExpressApplication {
    app;
    fileStorage;
    fileFilter;
    constructor(port) {
        this.app = express();
        this.port = port;


        this.fileStorage = multer.memoryStorage();

        this.fileFilter = (req, file, cb) => {
            if (
                file.mimetype === "image/png" ||
                file.mimetype === "image/jpg" ||
                file.mimetype === "image/jpeg"
            ) {
                cb(null, true);
            } else {
                cb(null, false);
            }
        };

        this.app.use(
            multer({
                storage: this.fileStorage,
                fileFilter: this.fileFilter,
                limits: {
                    fileSize: 5 * 1024 * 1024
                }
            }).fields([
                {
                    name: "image",
                    maxCount: 10,
                },
            ])
        );

        this.app.use(express.json({ type: "application/json", limit: "50mb" }));
        this.app.use(express.urlencoded({ extended: false, limit: "50mb" }));

        this.app.use(cors(corsOptions));
        //  __init__

        this.configureAssets();
        this.setupRoute();
        this.setupMiddlewares([
            errorHandler,
            express.json(),
            express.urlencoded(),
            apicache.middleware("5 minutes"),
        ]);

        this.setupLibrary([
            process.env.NODE_ENV === "development" ? morgan("dev") : "",
            compression(),
            helmet(),
            // cors(),
        ]);


    }

    setupMiddlewares(middlewaresArr) {
        middlewaresArr.forEach((middleware) => {
            this.app.use(middleware);
        });
    }

    setupRoute() {
        // Set Route here base (/api/v1)
        this.app.use("/api/v1/auth", AuthRoutes);
        this.app.use("/api/v1/measurement", MeasurementRoutes);
        this.app.use("/api/v1/notification", NotificationRoutes);
        this.app.use("/api/v1/iot", IotRoutes);
    }

    configureAssets() {
        this.app.use(express.static(path.join(__filename, "public")));
    }

    setupLibrary(libraries) {
        libraries.forEach((library) => {
            if (library != "" && library != null) {
                this.app.use(library);
            }
        });
    }

    async start() {
        try {
            await prisma.$connect();
           
            const server = http.createServer(this.app);

            initSocket(server);
            initMqtt();

            server.listen(this.port, () => {
                logger.info(`🚀 Server running on port ${this.port}`);
            });
            
            return server;
        } catch (error) {
            logger.error("❌ Server failed to start:", error);
            process.exit(1);
        }
    }
}

export default ExpressApplication;
