import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { requireUuid, validateBody } from "../middleware/validation.js";
import { apiKeySchema } from "../schemas.js";
import { accountService } from "../services/account.js";

const router = Router();
router.use(requireUser);

router.get("/usage", async (req, res) => {
  res.json(await accountService.recentUsage(req.user.id));
});

router.get("/subscription", async (req, res) => {
  res.json(await accountService.subscription(req.user.id));
});

router.post("/api-keys", validateBody(apiKeySchema), async (req, res) => {
  res.status(201).json(
    await accountService.createApiKey({
      userId: req.user.id,
      name: req.validatedBody.name,
      scopes: req.validatedBody.scopes,
      expiresAt: req.validatedBody.expires_at,
      requestId: req.requestId,
    }),
  );
});

router.get("/api-keys", async (req, res) => {
  res.json(await accountService.listApiKeys(req.user.id));
});

router.delete("/api-keys/:keyId", async (req, res) => {
  await accountService.revokeApiKey({
    userId: req.user.id,
    keyId: requireUuid(req.params.keyId, "key_id"),
    requestId: req.requestId,
  });
  res.json({ message: "API key revoked." });
});

export default router;
