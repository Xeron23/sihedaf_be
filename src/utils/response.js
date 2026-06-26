import statusCodes from "../errors/status-codes.js";

/**
 * Success response for successful operations
 * @param {any} data - The data to return in the response
 * @param {string} message - Success message
 * @returns {object} - Formatted success response
 */
export function successResponse(res, data = "Request successful", recordsTotal = null) {
    return res.status(statusCodes.OK.code).json({
        code: statusCodes.OK.code,
        status: statusCodes.OK.message,
        recordsTotal: recordsTotal == null ? (Array.isArray(data) ? data.length : 1) : recordsTotal,
        data: data,
        errors: null
    });
}
  
/**
 * Created response for resource creation
 * @param {any} data - The newly created resource
 * @param {string} message - Success message
 * @returns {object} - Formatted created response
 */
export function createdResponse(res, data = "Resource created successfully", recordsTotal = null) {
    return res.status(statusCodes.CREATED.code).json({
        code: statusCodes.CREATED.code,
        status: statusCodes.CREATED.message,
        recordsTotal: recordsTotal == null ? (Array.isArray(data) ? data.length : 1) : recordsTotal,
        data: data,
        errors: null
    });
}


  

  