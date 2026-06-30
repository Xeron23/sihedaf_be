import mqtt from "mqtt";
import logger from "../utils/logger.js";
import IotService from "../domains/iot/iot.service.js";
import { getIo } from "./socket.js";
import prisma from "./db.js";

// Buffer dictionary to store streaming data
// Format: { [deviceNumber]: { chunks: [], lastReceived: null } }
const deviceBuffers = {};

let mqttClient = null;

export function initMqtt() {
    const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
    const options = {
        username: process.env.MQTT_USERNAME || "iot_admin",
        password: process.env.MQTT_PASSWORD || "sihedaf"
    };
    mqttClient = mqtt.connect(brokerUrl, options);

    mqttClient.on("connect", () => {
        logger.info(`✅ Connected to MQTT Broker at ${brokerUrl}`);
        
        // Topic for hardware sending raw PPG streams
        mqttClient.subscribe("watch/+/stream", (err) => {
            if (err) logger.error("MQTT Subscribe Error:", err);
            else logger.info("✅ Subscribed to topic: watch/+/stream");
        });
        
        // Topic for hardware status (e.g. "FINISHED", "ONLINE")
        mqttClient.subscribe("watch/+/status", (err) => {
            if (err) logger.error("MQTT Subscribe Error:", err);
        });
    });

    mqttClient.on("message", async (topic, message) => {
        try {
            const parts = topic.split("/");
            const deviceNumber = parts[1];
            const action = parts[2]; // 'stream' or 'status'
            
            if (action === "stream") {
                const dataChunk = JSON.parse(message.toString());
                
                if (!deviceBuffers[deviceNumber]) {
                    deviceBuffers[deviceNumber] = { chunks: [], lastReceived: Date.now() };
                }
                
                deviceBuffers[deviceNumber].chunks.push(...dataChunk);
                deviceBuffers[deviceNumber].lastReceived = Date.now();
                
                // Forward chunk via Socket.io directly to frontend for live graph rendering!
                const io = getIo();
                if(io) {
                    io.emit(`live_graph_${deviceNumber}`, dataChunk);
                }
            } 
            else if (action === "status") {
                const statusStr = message.toString();
                
                if (statusStr === "ONLINE") {
                    // Daftarkan otomatis saat jam pertama kali konek
                    await prisma.device.upsert({
                        where: { deviceNumber: deviceNumber },
                        update: { status: "ONLINE", lastSeen: new Date() },
                        create: { deviceNumber: deviceNumber, status: "ONLINE", lastSeen: new Date() }
                    });
                    logger.info(`[MQTT] Device ${deviceNumber} is ONLINE`);
                }
                else if (statusStr === "FINISHED") {
                    logger.info(`[MQTT] Received FINISHED from ${deviceNumber}`);
                    
                    if (deviceBuffers[deviceNumber] && deviceBuffers[deviceNumber].chunks.length > 0) {
                        const fullPpgData = deviceBuffers[deviceNumber].chunks;
                        
                        // Pass the combined array to the AI logic
                        await IotService.submitData(deviceNumber, fullPpgData)
                            .catch(e => logger.error(`Error saving full MQTT data: ${e.message}`));
                        
                        delete deviceBuffers[deviceNumber];
                    }
                }
            }
        } catch (error) {
            logger.error(`[MQTT] Error processing message on ${topic}:`, error.message);
        }
    });

    return mqttClient;
}

export function getMqttClient() {
    if (!mqttClient) {
        throw new Error("MQTT Client has not been initialized");
    }
    return mqttClient;
}
