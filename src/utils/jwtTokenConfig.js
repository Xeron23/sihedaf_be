import jwt from "jsonwebtoken";

const generateToken = (payload, time = "1h") => {
    // Jika payload sudah berupa object (seperti pas login), gunakan apa adanya
    // Jika berupa primitive string/id (seperti pas forgot password), wrap ke dalam { id }
    const signPayload = typeof payload === 'object' && payload !== null && !Array.isArray(payload) 
        ? payload 
        : { id: payload };
        
    return jwt.sign(signPayload, process.env.JWT_SECRET, {
        expiresIn: time,
    });
};

const parseJWT = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        console.error("Invalid token:", error.message);
        return null;
    }
}

export { generateToken, parseJWT };