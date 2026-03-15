import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

const createCoverageSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  cityName: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
});

// POST / - authenticated user creates coverage request
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = createCoverageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const request = await prisma.coverageRequest.create({
      data: {
        user: { connect: { id: req.user!.userId } },
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        cityName: parsed.data.cityName,
        province: parsed.data.province,
        country: parsed.data.country,
      },
    });

    res.status(201).json(request);
  } catch (error) {
    console.error("Create coverage request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET / - admin only, list all coverage requests
router.get(
  "/",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;

      const where: Record<string, unknown> = {};
      if (status && ["PENDING", "IN_PROGRESS", "COMPLETED", "REJECTED"].includes(status)) {
        where.status = status;
      }

      const requests = await prisma.coverageRequest.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(requests);
    } catch (error) {
      console.error("List coverage requests error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

const updateCoverageSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "REJECTED"]),
  adminNotes: z.string().optional(),
});

// PUT /:id - admin only, update status and adminNotes
router.put(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const parsed = updateCoverageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      const existing = await prisma.coverageRequest.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Coverage request not found" });
        return;
      }

      const updated = await prisma.coverageRequest.update({
        where: { id: req.params.id },
        data: {
          ...parsed.data,
          resolvedAt:
            parsed.data.status === "COMPLETED" || parsed.data.status === "REJECTED"
              ? new Date()
              : undefined,
        },
      });

      res.json(updated);
    } catch (error) {
      console.error("Update coverage request error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
