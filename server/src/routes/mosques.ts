import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

// GET /nearby - find mosques within radius using Haversine formula
router.get("/nearby", async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);
    const radius = parseFloat((req.query.radius as string) || "20");

    if (isNaN(lat) || isNaN(lon)) {
      res.status(400).json({ error: "lat and lon query parameters are required" });
      return;
    }

    // Haversine formula in raw SQL to calculate distance in km
    const mosques = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        address: string;
        city: string;
        province: string;
        country: string;
        latitude: number;
        longitude: number;
        phone: string | null;
        website: string | null;
        hasLiveStream: boolean;
        streamUrl: string | null;
        adminEmail: string | null;
        verified: boolean;
        mawaqitId: string | null;
        iqamaSource: string | null;
        iqamaLastFetched: Date | null;
        distance: number;
      }>
    >`
      SELECT id, name, address, city, province, country, latitude, longitude,
             phone, website, "hasLiveStream", "streamUrl", "adminEmail", verified,
             "mawaqitId", "iqamaSource", "iqamaLastFetched",
             (6371 * acos(
               cos(radians(${lat})) * cos(radians(latitude)) *
               cos(radians(longitude) - radians(${lon})) +
               sin(radians(${lat})) * sin(radians(latitude))
             )) AS distance
      FROM "Mosque"
      WHERE (6371 * acos(
          cos(radians(${lat})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(${lon})) +
          sin(radians(${lat})) * sin(radians(latitude))
        )) <= ${radius}
      ORDER BY distance
    `;

    // Check if this area has been scanned (region coverage)
    // Simple check: see if any RegionScan covers nearby area
    const regionScans = await prisma.regionScan.findMany({
      where: {
        scanStatus: "COMPLETED",
      },
    });

    // Check if any scan region covers the requested point (within its radius)
    const isCovered = regionScans.some((scan) => {
      const d =
        6371 *
        Math.acos(
          Math.cos((lat * Math.PI) / 180) *
            Math.cos((scan.centerLat * Math.PI) / 180) *
            Math.cos(
              ((scan.centerLon - lon) * Math.PI) / 180
            ) +
            Math.sin((lat * Math.PI) / 180) *
              Math.sin((scan.centerLat * Math.PI) / 180)
        );
      return d <= scan.radiusKm;
    });

    res.json({
      mosques,
      uncoveredArea: !isCovered,
    });
  } catch (error) {
    console.error("Nearby mosques error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /:id - single mosque with iqama schedules
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const mosque = await prisma.mosque.findUnique({
      where: { id: req.params.id },
      include: {
        iqamaSchedules: {
          where: {
            effectiveFrom: { lte: new Date() },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: new Date() } },
            ],
          },
        },
      },
    });

    if (!mosque) {
      res.status(404).json({ error: "Mosque not found" });
      return;
    }

    res.json(mosque);
  } catch (error) {
    console.error("Get mosque error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const createMosqueSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  province: z.string().min(1),
  country: z.string().default("Canada"),
  latitude: z.number(),
  longitude: z.number(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  hasLiveStream: z.boolean().default(false),
  streamUrl: z.string().url().optional(),
  adminEmail: z.string().email().optional(),
});

// POST / - admin only, create mosque
router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createMosqueSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      const mosque = await prisma.mosque.create({ data: parsed.data });
      res.status(201).json(mosque);
    } catch (error) {
      console.error("Create mosque error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

const updateMosqueSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  province: z.string().min(1).optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  hasLiveStream: z.boolean().optional(),
  streamUrl: z.string().url().nullable().optional(),
  adminEmail: z.string().email().nullable().optional(),
});

// PUT /:id - admin only, update mosque
router.put(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const parsed = updateMosqueSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
        return;
      }

      const mosque = await prisma.mosque.findUnique({ where: { id: req.params.id } });
      if (!mosque) {
        res.status(404).json({ error: "Mosque not found" });
        return;
      }

      const updated = await prisma.mosque.update({
        where: { id: req.params.id },
        data: parsed.data,
      });

      res.json(updated);
    } catch (error) {
      console.error("Update mosque error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /:id - admin only, delete mosque
router.delete(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const mosque = await prisma.mosque.findUnique({ where: { id: req.params.id } });
      if (!mosque) {
        res.status(404).json({ error: "Mosque not found" });
        return;
      }

      await prisma.mosque.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      console.error("Delete mosque error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
