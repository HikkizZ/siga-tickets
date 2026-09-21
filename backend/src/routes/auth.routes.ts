import { Router } from "express";
import { loginRateLimiter } from "../auth/loginRateLimiter.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { cambiarPasswordReq, loginReq } from "../validations/auth.validation.js";
import { cambiarPasswordController, loginController, meController } from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", loginRateLimiter, validate(loginReq), loginController);
authRouter.get("/me", authenticate, meController);
authRouter.post("/password", authenticate, validate(cambiarPasswordReq), cambiarPasswordController);
