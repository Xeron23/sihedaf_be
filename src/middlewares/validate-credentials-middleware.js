const validateCredentials =
    (schema, property="body") =>
    (req, res, next) => {
        const validated = schema.validate(req[property], {
            abortEarly: false,
            errors: {
                wrap: {
                label: '',
                },
            },
            convert: true,
        });

        if (validated.error) {
            return next(validated.error);
        }
        next();
    };

export default validateCredentials;