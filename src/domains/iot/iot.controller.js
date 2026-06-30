import { successResponse } from "../../utils/response.js";
import IotService from "./iot.service.js";

class IotController {
    async pollTask(req, res) {
        const { deviceNumber } = req.params;
        const data = await IotService.checkPendingTask(deviceNumber);
        return successResponse(res, data);
    }

    async submitData(req, res) {
        const { deviceNumber } = req.params;
        const { rawPpgData, isFinished } = req.body;
        
        const data = await IotService.submitData(deviceNumber, rawPpgData, isFinished);
        return successResponse(res, data);
    }
}
export default new IotController();
