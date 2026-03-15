import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

// GET /mosque/:mosqueId - get current iqama times for a mosque
router.get("/mosque/:mosqueId", async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const schedules = await prisma.iqamaSchedule.findMany({
      where: {
        mosqueId: req.params.mosqueId,
        effectiveFrom: { lte: now },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: now } },
        ],
      },
      orderBy: { prayer: "asc" },
    });

    res.json(schedules);
  } catch (error) {
    console.error("Get iqama times error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const createIqamaSchema = z.object({
  prayer: z.enum(["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA", "JUMMAH"]),
  iqamaTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
  effectiveFrom: z.string().transform((s) => new Date(s)),
  effectiveTo: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
});

const createIqamaBatchSchema = z.object({
  schedules: z.array(createIqamaSchema),
});

// POST /mosque/:mosqueId - admin/mosque_admin only, set iqama times
router.post(
  "/mosque/:mosqueId",
  authenticate,
  requireRole("ADMIN", "MOSQUE_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createIqamaBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      const mosque = await prisma.mosque.findUnique({
        where: { id: req.params.mosqueId },
      });
      if (!mosque) {
        res.status(404).json({ error: "Mosque not found" });
        return;
      }

      const created = await prisma.$transaction(
        parsed.data.schedules.map((schedule) =>
          prisma.iqamaSchedule.create({
            data: {
              mosqueId: req.params.mosqueId,
              prayer: schedule.prayer,
              iqamaTime: schedule.iqamaTime,
              effectiveFrom: schedule.effectiveFrom,
              effectiveTo: schedule.effectiveTo,
            },
          })
        )
      );

      res.status(201).json(created);
    } catch (error) {
      console.error("Create iqama times error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

const updateIqamaSchema = z.object({
  iqamaTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format").optional(),
  effectiveFrom: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  effectiveTo: z
    .string()
    .transform((s) => new Date(s))
    .nullable()
    .optional(),
});

// PUT /:id - admin/mosque_admin only, update single iqama entry
router.put(
  "/:id",
  authenticate,
  requireRole("ADMIN", "MOSQUE_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const parsed = updateIqamaSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      const existing = await prisma.iqamaSchedule.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Iqama schedule not found" });
        return;
      }

      const updated = await prisma.iqamaSchedule.update({
        where: { id: req.params.id },
        data: parsed.data,
      });

      res.json(updated);
    } catch (error) {
      console.error("Update iqama error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
