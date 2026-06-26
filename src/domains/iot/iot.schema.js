import Joi from 'joi';

export const iotSubmitSchema = Joi.object({
    rawPpgData: Joi.array().required().messages({
        'any.required': 'rawPpgData is required in body payload',
        'array.base': 'rawPpgData must be an array'
    })
});

export const iotParamsSchema = Joi.object({
    deviceNumber: Joi.string().required().messages({
        'any.required': 'deviceNumber is required in params',
        'string.empty': 'deviceNumber cannot be empty'
    })
});