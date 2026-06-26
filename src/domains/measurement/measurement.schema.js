import Joi from 'joi';

export const measurementSchema = Joi.object({
    deviceNumber: Joi.string().required().messages({
        'any.required': 'deviceNumber is required',
        'string.empty': 'deviceNumber cannot be empty'
    })
});