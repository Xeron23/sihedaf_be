import { successResponse } from "../../utils/response.js";
import AuthService from "./auth-service.js";

class AuthController {
    /**
     * @route POST /auth/login
     * @desc Login user
     */
    async login(req, res) {
        const { email, password } = req.body;

        const response = await AuthService.login(email, password);

        if (!response) {
            throw Error("Failed to login");
        }

        return successResponse(res, response);
    }

    async loginWithSocialAccount(req, res) {
        const {email, provider} = req.body;

        const response = await AuthService.loginWithSocialAccount(provider, email);
        if(!response) {
            throw Error("Failed to login with social account");
        }

        return successResponse(res, response);
    }

    /**
     * @route POST /auth/register
     * @desc Register user
     */
    async register(req, res) {

        const { fullname, password, email} = req.body;
        const message = await AuthService.register({ fullname, password, email});

        if (!message) {
            throw Error("Failed to register");
        }

        return successResponse(res, message);
    }

    /**
     * @route GET /auth/profile
     * @desc Get user profile
     */
    async getProfile(req, res){
        const user = await AuthService.getProfile(req.user.id);

        if (!user) {
            throw Error("Failed to get user profile");
        }

        return successResponse(res, user);
    }

    /**
     * @route PUT /auth/profile
     * @desc Update user profile
     */
    async updateProfile(req, res){
        const { fullname } = req.body;
        let imageProfile = null;
        if(req.files){
            imageProfile = req.files.image;

        }
        const user = await AuthService.updateProfile(req.user.id, { fullname }, imageProfile);

        if (!user) {
            throw Error("Failed to update user profile");
        }

        return successResponse(res, user);
    }

    /**
     * @route PUT /auth/password
     * @desc Update user password
     */
    async updatePassword(req, res){
        const { old_password, new_password, confirm_password } = req.body;

        if(new_password !== confirm_password){
            throw Error("Failed to update user password")
        }

        const message = await AuthService.updatePasswordProfile(req.user.id, old_password, new_password);

        if (!message) {
            throw Error("Failed to update user password");
        }

        return successResponse(res, message);
    }

    /**
     * @route POST /auth/refresh-token
     * @desc Refresh access token
     */
    async refreshToken(req, res) {
        const { refresh_token } = req.body;

        const token = await AuthService.refreshToken(refresh_token);

        if (!token) {
            throw Error("Failed to refresh token");
        }

        return successResponse(res, { access_token: token });
    }

    /**
     * @route POST /auth/reset-password
     * @desc Generate email reset password
     */
    async emailResetPassword(req, res){
        const {email} = req.body;

        const response = await AuthService.generateEmailResetPassword(email)
        if(!response){
            throw Error("Failed to generate email");
        }
        return successResponse(res, response)
    }

    /**
     * @route GET /auth/reset-password/verify/:token
     * @desc Verify reset password token
     */
    async verifyResetPassword(req, res){
        const {token} = req.params;

        const response = await AuthService.verifyResetPassword(token);

        if (response.status !== 200) {
            return res.redirect(`${process.env.FE_URL}/#/reset-password?verify=failed&message=${response.message}`);
        }
        console.log(response);
        
        return res.redirect(`${process.env.FE_URL}/#/reset-password?verify=success&token=${response.data}`);
    }

    /**
     * @route POST /auth/reset-password/update
     * @desc Reset user password
     */
    async resetPassword(req, res){
        const {new_password, confirm_password, token } = req.body;

        if(new_password !== confirm_password){
            throw Error("Failed to update user password")
        }

        const message = await AuthService.resetPassword(new_password, token);

        if(!message){
            throw Error("failed to reset password")
        }
        return successResponse(res, message);
    }
}

export default new AuthController();