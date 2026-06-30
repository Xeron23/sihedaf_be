import Joi from 'joi';

export const measurementSchema = Joi.object({
    // Tidak butuh payload deviceNumber lagi saat start/stop, karena otomatis ambil dari akun user
});

export const bindDeviceSchema = Joi.object({
    deviceNumber: Joi.string().required().messages({
        'any.required': 'deviceNumber is required',
        'string.empty': 'deviceNumber cannot be empty'
    })
});