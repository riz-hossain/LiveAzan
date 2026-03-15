import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, optionalAuth, requireRole } from "../middleware/auth";

const router = Router();

// ─── Validation Schemas ──────────────────────────────────────────────────────

const submitMosqueSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(["MOSQUE", "MUSALLA"]).default("MOSQUE"),
  address: z.string().min(5).max(500),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  country: z.string().max(100).default("Canada"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().max(20).optional(),
  website: z.string().url().max(500).optional(),
  googleRating: z.number().min(0).max(5).optional(),
  googleReviewCount: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
  photoUrl: z.string().url().max(500).optional(),
});

const reviewSubmissionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  adminNotes: z.string().max(1000).optional(),
});

// ─── Public/User Routes ──────────────────────────────────────────────────────

// POST /submissions - Submit a new mosque/musalla (auth optional)
router.post("/", optionalAuth, async (req: Request, res: Response) => {
  try {
    const parsed = submitMosqueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    // Check for duplicates (same name within 200m)
    const existing = await prisma.mosque.findFirst({
      where: {
        name: { contains: parsed.data.name, mode: "insensitive" },
        latitude: { gte: parsed.data.latitude - 0.002, lte: parsed.data.latitude + 0.002 },
        longitude: { gte: parsed.data.longitude - 0.002, lte: parsed.data.longitude + 0.002 },
      },
    });

    if (existing) {
      res.status(409).json({
        error: "Duplicate detected",
        message: `A mosque named "${existing.name}" already exists at this location.`,
        existingId: existing.id,
      });
      return;
    }

    // Also check pending submissions
    const pendingDuplicate = await prisma.mosqueSubmission.findFirst({
      where: {
        status: "PENDING",
        name: { contains: parsed.data.name, mode: "insensitive" },
        latitude: { gte: parsed.data.latitude - 0.002, lte: parsed.data.latitude + 0.002 },
        longitude: { gte: parsed.data.longitude - 0.002, lte: parsed.data.longitude + 0.002 },
      },
    });

    if (pendingDuplicate) {
      res.status(409).json({
        error: "Already submitted",
        message: `A submission for "${pendingDuplicate.name}" is already pending review.`,
      });
      return;
    }

    const submission = await prisma.mosqueSubmission.create({
      data: {
        ...parsed.data,
        submittedBy: req.user?.userId || null,
      },
    });

    res.status(201).json({
      id: submission.id,
      message: "Thank you! Your submission is pending admin review.",
      status: submission.status,
    });
  } catch (error) {
    console.error("Submit mosque error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /submissions/mine - Get my submissions (authenticated)
router.get("/mine", authenticate, async (req: Request, res: Response) => {
  try {
    const submissions = await prisma.mosqueSubmission.findMany({
      where: { submittedBy: req.user!.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(submissions);
  } catch (error) {
    console.error("Get my submissions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Admin Routes ────────────────────────────────────────────────────────────

// GET /submissions - List all submissions (admin only)
router.get(
  "/",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const where: Record<string, unknown> = {};
      if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
        where.status = status;
      }

      const submissions = await prisma.mosqueSubmission.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(submissions);
    } catch (error) {
      console.error("List submissions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PUT /submissions/:id/review - Approve or reject (admin only)
router.put(
  "/:id/review",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const parsed = reviewSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      const submission = await prisma.mosqueSubmission.findUnique({
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

      // If approved, create the mosque in the main table
      let createdMosque = null;
      if (parsed.data.status === "APPROVED") {
        createdMosque = await prisma.mosque.create({
          data: {
            name: submission.name,
            type: submission.type,
            address: submission.address,
            city: submission.city,
            province: submission.province,
            country: submission.country,
            latitude: submission.latitude,
            longitude: submission.longitude,
            phone: submission.phone,
            website: submission.website,
            googleRating: submission.googleRating,
            googleReviewCount: submission.googleReviewCount,
            notes: submission.notes,
            verified: true,
          },
        });
      }

      // Update submission status
      const updated = await prisma.mosqueSubmission.update({
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
        mosque: createdMosque,
        message: parsed.data.status === "APPROVED"
          ? `Mosque "${submission.name}" has been approved and added to the database.`
          : `Submission "${submission.name}" has been rejected.`,
      });
    } catch (error) {
      console.error("Review submission error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
