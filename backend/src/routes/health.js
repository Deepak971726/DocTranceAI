import { Router } from "express";
import { register } from "prom-client";
import { pool } from "../db.js";
import { vectorStore } from "../integrations/qdrant.js";

const router = Router();

router.get("/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/health/ready", async (_req, res) => {
  const checks = {};
  try {
    await pool.query("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "failed";
  }
  try {
    await vectorStore.ready();
    checks.qdrant = "ok";
  } catch {
    checks.qdrant = "failed";
  }
  const ready = Object.values(checks).every((value) => value === "ok");
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    checks,
  });
});

router.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

export default router;
