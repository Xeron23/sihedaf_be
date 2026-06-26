import { successResponse } from "../../utils/response.js";
import MeasurementService from "./measurement.service.js";

class MeasurementController {
    async startMeasurement(req, res) {
        const { deviceNumber } = req.body;
        
        const data = await MeasurementService.startMeasurement(req.user.id, deviceNumber);
        return successResponse(res, data); 
    }

    async stopMeasurement(req, res) {
        const { deviceNumber } = req.body;
        
        const data = await MeasurementService.stopMeasurement(req.user.id, deviceNumber);
        return successResponse(res, data); 
    }
    
    async getHistory(req, res) {
        const data = await MeasurementService.getHistory(req.user.id);
        return successResponse(res, data);
    }
}
export default new MeasurementController();
