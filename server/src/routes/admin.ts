/**
 * Admin-only routes for iqama enrichment and coverage reporting.
 *
 * All routes require authentication + ADMIN role.
 *
 * POST /api/admin/enrich-city         — bulk enrich a city
 * POST /api/admin/enrich-mosque/:id   — enrich a single mosque
 * GET  /api/admin/iqama-coverage      — coverage stats by city
 * POST /api/admin/run-refresh-job     — manually trigger the monthly cron job
 * GET  /api/admin/refresh-logs        — recent monthly job run history
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { enrichCity, enrichMosque } from "../services/iqamaEnrichment";
import { runIqamaRefreshJob } from "../jobs/iqamaRefreshJob";

const router = Router();
const adminOnly = [authenticate, requireRole("ADMIN")];

// ─── POST /enrich-city ────────────────────────────────────────────────────────

const enrichCitySchema = z.object({
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  force: z.boolean().optional().default(false),
});

router.post("/enrich-city", ...adminOnly, async (req: Request, res: Response) => {
  const parsed = enrichCitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  try {
    const report = await enrichCity(parsed.data.city, parsed.data.province, parsed.data.force);
    res.json({ ok: true, report });
  } catch (err) {
    console.error("[admin] enrich-city error:", err);
    res.status(500).json({ error: "Enrichment failed" });
  }
});

// ─── POST /enrich-mosque/:id ──────────────────────────────────────────────────

router.post("/enrich-mosque/:id", ...adminOnly, async (req: Request, res: Response) => {
  const force = req.body?.force === true;
  try {
    const result = await enrichMosque(req.params.id, force);
    res.json({ ok: true, result });
  } catch (err) {
    console.error("[admin] enrich-mosque error:", err);
    res.status(500).json({ error: "Enrichment failed" });
  }
});

// ─── GET /iqama-coverage ──────────────────────────────────────────────────────

router.get("/iqama-coverage", ...adminOnly, async (_req: Request, res: Response) => {
  try {
    const mosques = await prisma.mosque.findMany({
      select: {
        id: true,
        city: true,
        province: true,
        iqamaLastFetched: true,
        _count: { select: { iqamaSchedules: true } },
      },
    });

    const total = mosques.length;
    const withIqama = mosques.filter((m) => m._count.iqamaSchedules > 0).length;

    // Group by city+province
    const byCity: Record<string, { total: number; withIqama: number }> = {};
    for (const m of mosques) {
      const key = `${m.city}, ${m.province}`;
      if (!byCity[key]) byCity[key] = { total: 0, withIqama: 0 };
      byCity[key].total++;
      if (m._count.iqamaSchedules > 0) byCity[key].withIqama++;
    }

    res.json({ total, withIqama, missing: total - withIqama, byCity });
  } catch (err) {
    console.error("[admin] iqama-coverage error:", err);
    res.status(500).json({ error: "Failed to fetch coverage" });
  }
});

// ─── POST /run-refresh-job ────────────────────────────────────────────────────

router.post("/run-refresh-job", ...adminOnly, async (_req: Request, res: Response) => {
  // Run async, respond immediately with confirmation
  res.json({ ok: true, message: "Refresh job started — check /refresh-logs for results" });

  runIqamaRefreshJob("admin").catch((err) => {
    console.error("[admin] run-refresh-job error:", err);
  });
});

// ─── GET /refresh-logs ────────────────────────────────────────────────────────

router.get("/refresh-logs", ...adminOnly, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  try {
    const logs = await prisma.iqamaRefreshLog.findMany({
      orderBy: { runAt: "desc" },
      take: limit,
    });
    res.json({ logs });
  } catch (err) {
    console.error("[admin] refresh-logs error:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

export default router;
