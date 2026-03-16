import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, optionalAuth, requireRole } from "../middleware/auth";

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

// ─── User Prayer-Time Submissions ────────────────────────────────────────────

const iqamaSubmissionSchema = z.object({
  sourceUrl: z.string().url().max(1000),
  prayerTimes: z.record(z.string()),  // { fajr, dhuhr, asr, maghrib, isha, ... }
});

/**
 * POST /iqama/mosque/:mosqueId/submissions
 * Allow any user (or guest) to submit scraped prayer times for admin review.
 */
router.post(
  "/mosque/:mosqueId/submissions",
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const parsed = iqamaSubmissionSchema.safeParse(req.body);
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

      const submission = await prisma.iqamaSubmission.create({
        data: {
          mosqueId: req.params.mosqueId,
          submittedBy: req.user?.userId ?? null,
          sourceUrl: parsed.data.sourceUrl,
          prayerTimes: parsed.data.prayerTimes,
        },
      });

      res.status(201).json({
        id: submission.id,
        message: "Prayer times submitted for admin review. Thank you!",
        status: submission.status,
      });
    } catch (error) {
      console.error("IqamaSubmission create error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /iqama/mosque/:mosqueId/submissions  (admin only)
 * List all iqama submissions for a mosque.
 */
router.get(
  "/mosque/:mosqueId/submissions",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const submissions = await prisma.iqamaSubmission.findMany({
        where: {
          mosqueId: req.params.mosqueId,
          ...(req.query.status
            ? { status: req.query.status as any }
            : {}),
        },
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(submissions);
    } catch (error) {
      console.error("IqamaSubmission list error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * PUT /iqama/submissions/:id/review  (admin only)
 * Approve or reject an iqama submission.
 * On approval, the prayer times are written to IqamaSchedule.
 */
const reviewIqamaSubmissionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  adminNotes: z.string().max(1000).optional(),
});

router.put(
  "/submissions/:id/review",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const parsed = reviewIqamaSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      const submission = await prisma.iqamaSubmission.findUnique({
        where: { id: req.params.id },
      });
      if (!submission) {
        res.status(404).json({ error: "Submission not found" });
        return;
      }
      if (submission.status !== "PENDING") {
        res.status(400).json({ error: "Submission already reviewed" });
        return;
      }

      if (parsed.data.status === "APPROVED") {
        const times = submission.prayerTimes as Record<string, string>;
        const prayerMap: Array<[string, string]> = [
          ["fajr", "FAJR"],
          ["dhuhr", "DHUHR"],
          ["asr", "ASR"],
          ["maghrib", "MAGHRIB"],
          ["isha", "ISHA"],
        ];
        const now = new Date();

        // Expire any existing current iqama schedules for this mosque
        await prisma.iqamaSchedule.updateMany({
          where: {
            mosqueId: submission.mosqueId,
            effectiveTo: null,
          },
          data: { effectiveTo: now },
        });

        // Create new schedules from approved submission
        await prisma.$transaction(
          prayerMap
            .filter(([k]) => times[k])
            .map(([k, prayer]) =>
              prisma.iqamaSchedule.create({
                data: {
                  mosqueId: submission.mosqueId,
                  prayer: prayer as any,
                  iqamaTime: times[k],
                  effectiveFrom: now,
                },
              })
            )
        );

        // Mark source on mosque
        await prisma.mosque.update({
          where: { id: submission.mosqueId },
          data: {
            iqamaSource: "website",
            iqamaLastFetched: now,
          },
        });
      }

      const updated = await prisma.iqamaSubmission.update({
        where: { id: req.params.id },
        data: {
          status: parsed.data.status,
          adminNotes: parsed.data.adminNotes,
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
        },
      });

      res.json({
        submission: updated,
        message:
          parsed.data.status === "APPROVED"
            ? "Prayer times approved and applied to mosque schedule."
            : "Submission rejected.",
      });
    } catch (error) {
      console.error("IqamaSubmission review error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
