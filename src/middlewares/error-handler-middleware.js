import logger from "../utils/logger.js";
import BaseError from "../base_classes/base-error.js";
import StatusCodes from "../errors/status-codes.js";
import { INVALID_CREDENTIALS, SERVER_PROBLEM } from "../errors/error-codes.js";
import useragent from "useragent";
import prisma from "../config/db.js";


export const errorHandler = async(err, req, res, _next) => {
    const statusCode = Object.values(StatusCodes).find((code) => code.message === err.statusCode);

    if (err.name === "ValidationError") {
        const errorObj = {};
        console.log(err);
        for (const error of err.details) {
            errorObj[error.path] = [error.message];
        }

        return res.status(StatusCodes.BAD_REQUEST.code).json({
            code: 400,
            status: StatusCodes.BAD_REQUEST.message,
            recordsTotal: 0,
            data: null,
            errors: {
                name: err.name,
                message: err.message,
                validation: errorObj,
            },
        });
    }

    console.log(err);

    if (err instanceof BaseError) {
        console.error(err);
        return res.status(statusCode.code).json({
        code: err.errorCode,
        status: err.statusCode,
        recordsTotal: 0,
        data: null,
        errors: {
            name: err.errorName,
            message: err.message,
            validation: null
        },
        });
    }
    console.error(err);

    console.log(req.body);
    
    // ambil user id
    const user = await prisma.user.findFirst({
        where: { email: req.body?.email },
        select: { id: true }
    });

    // ambil ip
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    // ambil device
    const userAgent = useragent.parse(req.headers["user-agent"]);
    const device = userAgent.toString();

    const url = req.originalUrl;

    // method
    const method = req.method;
    await prisma.systemLog.create({
        data: {
            userId: user ? user.id : null,
            action: url,
            ipAddress: ip,
            device: device,
            method: method,
            description: err.message
        }
    });


    return res.status(StatusCodes.INTERNAL_SERVER.code).json({
        code: 500,
        status: StatusCodes.INTERNAL_SERVER.message,
        recordsTotal: 0,
        data: null,
        errors: {
        name: err.name,
        message: err.message,
        validation: null
        },
    });
};

export default errorHandler;