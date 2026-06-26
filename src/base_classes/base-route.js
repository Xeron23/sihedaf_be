import express from "express";

const { Router } = express;

class BaseRoutes {
    router;

    constructor() {
        this.router = Router();
        this.routes();
    }

    routes() {
        throw new Error("Routes method must be implemented in child classes.");
    }
}

export default BaseRoutes;