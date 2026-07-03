import BaseError from "../../base_classes/base-error.js";
import { generateVerifEmail } from "../../utils/bodyEmail.js";
import sendEmail from "../../utils/sendEmail.js";
import { parseJWT, generateToken } from "../../utils/jwtTokenConfig.js";
import joi from "joi";
import prisma from "../../config/db.js";
import { hashPassword, matchPassword } from "../../utils/passwordConfig.js";
import { uploadFile } from "../../utils/saveImage.js";


class AuthService {

    /**
     * Login User
     * @param {string} username - The username or email of the user
     * @param {string} password - The password of the user
     * @returns {Object} - Access and refresh tokens upon successful login
     * @throws {BaseError} - If credentials are invalid
     */
    async login(email, password) {
        let user = await prisma.user.findFirst({
            where: {
                email: email
            }
        });

        if (!user) {
            throw BaseError.notFound("User not found");

        }

        const isMatch = await matchPassword(password, user.password);
        
        if (!isMatch) {
            throw BaseError.badRequest("Invalid credentials");
        }


        const accessToken = generateToken({id: user.id, account_type: user.role}, "1d");
        const refreshToken = generateToken(user.id, "365d");

        return { access_token: accessToken, refresh_token: refreshToken };
    }

    // Login via Google / Facebook
    async loginWithSocialAccount(provider, username) {
        const allowedProviders = ["google", "facebook"];

        // if (!username) {
        //     throw BaseError.badRequest("Username is required");
        // }

        if (!allowedProviders.includes(provider)) {
            throw BaseError.badRequest("Unsupported provider.");
        }

        const user = await prisma.user.findFirst({
            where: {
                email: username
            }
        });
        if (!user) {
            throw BaseError.notFound("User not found");
        }

        const accessToken = generateToken({ id: user.id, account_type: user.role }, "1d");
        const refreshToken = generateToken(user.id, "365d");

        return { access_token: accessToken, refresh_token: refreshToken};
    }

    /**
     * Register User
     * @param {Object} data - The user data for registration
     * @returns {Object} - Success message upon registration
     * @throws {joi.ValidationError} - If email or username already exists
     */
    async register(data) {
        const emailExist = await prisma.user.findUnique({
            where: {
                email: data.email
            }
        });

        if (emailExist) {
            let validation = "";
            let stack = [];

            if (emailExist) {
                validation = "Email already taken.";

                stack.push({
                    message: "Email already taken.",
                    path: ["email"]
                });
            }
            throw new joi.ValidationError(validation, stack);
        }

        data.password = await hashPassword(data.password);
        const createdUser = await prisma.user.create({
            data: data
        });

        if (!createdUser) {
            throw Error("Failed to register");
        }


        return {message: "User registered successfully."};
    }

    /**
     * Get User Profile
     * @param {number} id - The ID of the user
     * @returns {Object} - User profile data
     * @throws {BaseError} - If user is not found
     */
    async getProfile(id) {
        const u = await prisma.user.findUnique({
        where: { id: id },
        select: {
            id: true, fullname: true, email: true, role: true, profileImage: true
        }
        });

        return { user: { id:u.id, fullname:u.fullname, email:u.email, role:u.role, profileImage:u.profileImage,  } };
    }

    /**
     * Update User Profile
     * @param {number} id - The ID of the user
     * @param {Object} data - The profile data to update
     * @param {Object} imgProfile - The profile image file
     * @returns {Object} - Updated user profile data
     * @throws {BaseError} - If user is not found
     * @throws {joi.ValidationError} - If email is already taken
     */
    async updateProfile(id, data, imgProfile) {
        const user = await prisma.user.findUnique({
            where: {
                id: id
            }
        });

        if (!user) {
            throw BaseError.notFound("User not found");
        }


        if(imgProfile){
            const profileUserUrl = `profile-user/${user.id}`;
            const uploadImageUrl = await uploadFile(profileUserUrl, imgProfile);
            if (!uploadImageUrl || !uploadImageUrl.length) {
                throw new Error("failed to upload image");
            }

            data.profileImage = uploadImageUrl[0];
        }

        const updatedUser = await prisma.user.update({
            where: {
                id: user.id
            },
            data: data,
            select: {
                id: true,
                email: true,
                fullname: true
            }
        });

        return updatedUser;
    }

    /**
     * Update User Password
     * @param {number} id - The ID of the user
     * @param {string} oldPassword - The current password of the user
     * @param {string} newPassword - The new password to set
     * @returns {Object} - Success message upon password update
     * @throws {BaseError} - If user is not found
     * @throws {joi.ValidationError} - If old password is incorrect or new password is same as old password
     */
    async updatePasswordProfile(id, oldPassword, newPassword) {
        const user = await prisma.user.findUnique({
            where: {
                id: id
            }
        })


        if (!user) {
            throw BaseError.notFound("User not found");
        }

        const isMatch = await matchPassword(oldPassword, user.password);

        if (!isMatch) {
            throw new joi.ValidationError("Wrong Password", [{'message': 'Wrong Password', 'path': ['old_password']}]);
        }

        if (oldPassword === newPassword) {
            throw new joi.ValidationError("New password cannot be the same as the old password", [{'message': 'New password cannot be the same as the old password', 'path': ['new_password']}]);
        }

        user.password = await hashPassword(newPassword);
        await prisma.user.update({
            where: {
                id: id
            },
            data: {
                password: user.password
            }
        })

        return { message: "Password updated successfully" };
    }
    
    /**
     * Refresh Access Token
     * @param {string} token - The refresh token
     * @returns {string} - New access token
     * @throws {BaseError} - If token is invalid or user is not found
     */
    async refreshToken(token) {
        
        const decoded = parseJWT(token);
        
        if (!decoded) {
            throw BaseError.unauthorized("Invalid token");
        }

        const user = await prisma.user.findUnique({
            where: {
                id: decoded.id
            }
        });

        if (!user) {
            throw BaseError.notFound("User not found");
        }

        const accessToken = generateToken(user.id, "1d");

        return accessToken;
    }

    /**
     * Generate Email for Reset Password
     * @param {string} email - The email of the user
     * @returns {Object} - Success message upon sending reset password email
     * @throws {BaseError} - If user is not found
     */
    async generateEmailResetPassword(email){
        const user = await prisma.user.findFirst({
            where: {
                email: email
            },
            select: {
                fullname: true,
                id: true,
                email: true,
                role: true
            }
        })
        if(!user){
            throw BaseError.notFound("user not found");
        }

        const token = generateToken(user.id, "5m");
            const verificationLink = `${process.env.BE_URL}/api/v1/auth/verify-reset-password/${token}`;
            console.log("link: ", verificationLink);
        
        const emailHtml = generateVerifEmail(verificationLink);

        sendEmail(
                user.email,
                "Reset password dari Mou: Journaling",
                "Silankah mengklik link di bawah",
                emailHtml
        );

        return {message: "Successfully send reset password. Please check your email to reset your password"};
    }

    /**
     * Verify Reset Password Token
     * @param {string} token - The reset password token
     * @returns {Object} - Status and message of verification
     */
    async verifyResetPassword(token){
        const decoded = parseJWT(token);

        if(!decoded){
            return { status: 400, message: "Invalid token" };
        }

        const user = await  prisma.user.findUnique({
            where: {
                id: decoded.id
            },
            select: {
                fullname: true,
                id: true,
                email: true,
                role: true
            }
        });
        if (!user) {
            return { status: 400, message: "User Not Found" }
        }

        return {status: 200, message: "Password verification successfully", data: token}
    }

    /**
     * Reset Password
     * @param {string} newPassword - The new password to set
     * @param {string} token - The reset password token
     * @returns {Object} - Success message upon password reset
     * @throws {BaseError} - If user is not found
     */
    async resetPassword(newPassword, token){
        const decoded = parseJWT(token);
        console.log(decoded);
        

        if(!decoded){
            return { status: 400, message: "Invalid token" };
        }

        const user = await prisma.user.findUnique({
            where: {
                id: decoded.id,
            }
        })
        if(!user){
            throw BaseError.notFound("user not found");
        }

        user.password = await hashPassword(newPassword);
        await prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                password: user.password
            }
        })

        return {message: "Password reset succesfully"}
    }
}

export default new AuthService();