import statusCodes from "../errors/status-codes.js";

class BaseError extends Error {
    constructor(errorCode, statusCode, errorName, message) {
        super(message);
        this.errorCode = errorCode;
        this.statusCode = statusCode;
        this.errorName = errorName;
    }

    static notFound(message = "Resource does not exist") {
        return new BaseError(statusCodes.NOT_FOUND.code, statusCodes.NOT_FOUND.message, "Resource Not Found", message);
    }

    static badRequest(message = "Bad Request") {
        return new BaseError(statusCodes.BAD_REQUEST.code, statusCodes.BAD_REQUEST.message, "Bad Request", message);
    }

    static unauthorized(message = "Unauthorized") {
        return new BaseError(statusCodes.UNAUTHORIZED.code, statusCodes.UNAUTHORIZED.message, "UNAUTHORIZED", message);
    }

    static forbidden(message = "Forbidden") {
        return new BaseError(statusCodes.FORBIDDEN.code, statusCodes.FORBIDDEN.message, "Forbidden", message);
    }
}

export default BaseError;
