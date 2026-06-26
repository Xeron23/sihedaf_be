import BaseRoutes from "../../base_classes/base-route.js";
import AuthController from "./auth-controller.js";

import tryCatch from "../../utils/tryCatcher.js";
import validateCredentials from '../../middlewares/validate-credentials-middleware.js';
import { registerSchema, loginSchema, changePasswordSchema, refreshTokenSchema, profileSchema, resetPasswordSchema, emailResetPasswordSchema, socialLoginSchema } from './auth-schema.js';
import AuthMiddleware from "../../middlewares/auth-token-middleware.js";

class AuthRoutes extends BaseRoutes {
    routes() {
        this.router.post("/register", [
            validateCredentials(registerSchema),
            tryCatch(AuthController.register)
        ]);
        this.router.post("/login", [
            validateCredentials(loginSchema),
            tryCatch(AuthController.login)
        ]);
        this.router.post("/login-social-account", [
            validateCredentials(socialLoginSchema),
            tryCatch(AuthController.loginWithSocialAccount)
        ]);
        // this.router.get("/verify/:token", [
        //     tryCatch(AuthController.verify)
        // ]);
        this.router.post("/refresh-token", [ 
            validateCredentials(refreshTokenSchema),
            tryCatch(AuthController.refreshToken)
        ]),
        this.router.get("/me", [
            AuthMiddleware.authenticate,
            tryCatch(AuthController.getProfile)
        ]);
        this.router.put("/me/update", [
            AuthMiddleware.authenticate,
            validateCredentials(profileSchema),
            tryCatch(AuthController.updateProfile)
        ]);
        this.router.patch("/me/update-password", [
            AuthMiddleware.authenticate,
            validateCredentials(changePasswordSchema),
            tryCatch(AuthController.updatePassword)
        ]);

        this.router.post("/email-reset-password", [
            validateCredentials(emailResetPasswordSchema),
            tryCatch(AuthController.emailResetPassword)
        ])
        this.router.get("/verify-reset-password/:token", [
            tryCatch(AuthController.verifyResetPassword)
        ])
        this.router.post("/reset-password", [
            validateCredentials(resetPasswordSchema),
            tryCatch(AuthController.resetPassword)
        ])
    }
}

export default new AuthRoutes().router;