import { successResponse } from "../../utils/response.js";
import MeasurementService from "./measurement.service.js";

class MeasurementController {
    async bindDevice(req, res) {
        const { deviceNumber } = req.body;
        const data = await MeasurementService.bindDevice(req.user.id, deviceNumber);
        return successResponse(res, data);
    }

    async getMyDevice(req, res) {
        const data = await MeasurementService.getMyDevice(req.user.id);
        return successResponse(res, data);
    }

    async startMeasurement(req, res) {
        const data = await MeasurementService.startMeasurement(req.user.id);
        return successResponse(res, data); 
    }

    async stopMeasurement(req, res) {
        const data = await MeasurementService.stopMeasurement(req.user.id);
        return successResponse(res, data); 
    }
    
    async getHistory(req, res) {
        const data = await MeasurementService.getHistory(req.user.id);
        return successResponse(res, data);
    }

    async getLatestMeasurement(req, res) {
        const data = await MeasurementService.getLatestMeasurement(req.user.id);
        return successResponse(res, data);
    }

    async getPpgSignal(req, res) {
        const { id } = req.params;
        // Ambil query 'seconds', default ke 3 detik jika tidak dikirim (misal: ?seconds=6)
        const seconds = parseInt(req.query.seconds) || 3; 

        const data = await MeasurementService.getPpgSignalSubset(id, req.user.id, seconds);
        return successResponse(res, data);
    }
}
export default new MeasurementController();
