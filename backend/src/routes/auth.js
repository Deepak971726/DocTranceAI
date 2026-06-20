import { Router } from "express";
import { validateBody } from "../middleware/validation.js";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from "../schemas.js";
import { authService } from "../services/auth.js";

const router = Router();

const clientMetadata = (req) => ({
  ipAddress: req.ip,
  userAgent: req.get("user-agent") ?? null,
  requestId: req.requestId,
});

router.post("/register", validateBody(registerSchema), async (req, res) => {
  const payload = req.validatedBody;
  const user = await authService.register({
    email: payload.email,
    password: payload.password,
    fullName: payload.full_name,
    ...clientMetadata(req),
  });
  res.status(201).json(user);
});

router.post("/login", validateBody(loginSchema), async (req, res) => {
  res.json(
    await authService.login({
      email: req.validatedBody.email,
      password: req.validatedBody.password,
      ...clientMetadata(req),
    }),
  );
});

router.post("/refresh", validateBody(refreshSchema), async (req, res) => {
  res.json(
    await authService.refresh({
      refreshToken: req.validatedBody.refresh_token,
      ...clientMetadata(req),
    }),
  );
});

router.post("/logout", validateBody(logoutSchema), async (req, res) => {
  await authService.logout(req.validatedBody.refresh_token);
  res.json({ message: "Logged out." });
});

router.post("/forgot-password", validateBody(forgotPasswordSchema), async (req, res) => {
  await authService.requestPasswordReset({
    email: req.validatedBody.email,
    ...clientMetadata(req),
  });
  res.json({ message: "If that account exists, a password reset email has been sent." });
});

router.post("/reset-password", validateBody(resetPasswordSchema), async (req, res) => {
  await authService.resetPassword({
    rawToken: req.validatedBody.token,
    password: req.validatedBody.password,
    requestId: req.requestId,
  });
  res.json({ message: "Password reset completed." });
});

export default router;
