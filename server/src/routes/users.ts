import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

// All user routes require authentication
router.use(authenticate);

// GET /me - get current user profile
router.get("/me", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        authProvider: true,
        emailVerified: true,
        defaultLeadMinutes: true,
        calcMethod: true,
        azanSound: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  calcMethod: z.number().int().min(0).max(15).optional(),
  azanSound: z.string().optional(),
  defaultLeadMinutes: z.number().int().min(0).max(120).optional(),
});

// PUT /me - update profile
router.put("/me", async (req: Request, res: Response) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        defaultLeadMinutes: true,
        calcMethod: true,
        azanSound: true,
        role: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /me/prayer-prefs - get user's per-prayer notification preferences
router.get("/me/prayer-prefs", async (req: Request, res: Response) => {
  try {
    const prefs = await prisma.userPrayerPreference.findMany({
      where: { userId: req.user!.userId },
      orderBy: { prayer: "asc" },
    });

    res.json(prefs);
  } catch (error) {
    console.error("Get prayer prefs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const prayerPrefSchema = z.object({
  prayer: z.enum(["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA", "JUMMAH"]),
  leadMinutes: z.number().int().min(0).max(120),
  notificationType: z.enum(["AZAN", "SILENT_ALERT", "DEPARTURE_REMINDER"]).default("AZAN"),
  enabled: z.boolean().default(true),
});

const updatePrayerPrefsSchema = z.object({
  preferences: z.array(prayerPrefSchema),
});

// PUT /me/prayer-prefs - update prayer preferences
router.put("/me/prayer-prefs", async (req: Request, res: Response) => {
  try {
    const parsed = updatePrayerPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const userId = req.user!.userId;

    const results = await prisma.$transaction(
      parsed.data.preferences.map((pref) =>
        prisma.userPrayerPreference.upsert({
          where: {
            userId_prayer: { userId, prayer: pref.prayer },
          },
          create: {
            userId,
            prayer: pref.prayer,
            leadMinutes: pref.leadMinutes,
            notificationType: pref.notificationType,
            enabled: pref.enabled,
          },
          update: {
            leadMinutes: pref.leadMinutes,
            notificationType: pref.notificationType,
            enabled: pref.enabled,
          },
        })
      )
    );

    res.json(results);
  } catch (error) {
    console.error("Update prayer prefs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /me/mosques - get user's followed mosques
router.get("/me/mosques", async (req: Request, res: Response) => {
  try {
    const userMosques = await prisma.userMosque.findMany({
      where: { userId: req.user!.userId },
      include: { mosque: true },
    });

    res.json(userMosques);
  } catch (error) {
    console.error("Get user mosques error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const followMosqueSchema = z.object({
  mosqueId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

// POST /me/mosques - follow a mosque
router.post("/me/mosques", async (req: Request, res: Response) => {
  try {
    const parsed = followMosqueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const userId = req.user!.userId;
    const { mosqueId, isPrimary } = parsed.data;

    const mosque = await prisma.mosque.findUnique({ where: { id: mosqueId } });
    if (!mosque) {
      res.status(404).json({ error: "Mosque not found" });
      return;
    }

    // If setting as primary, unset other primaries first
    if (isPrimary) {
      await prisma.userMosque.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const userMosque = await prisma.userMosque.upsert({
      where: {
        userId_mosqueId: { userId, mosqueId },
      },
      create: { userId, mosqueId, isPrimary },
      update: { isPrimary },
      include: { mosque: true },
    });

    res.status(201).json(userMosque);
  } catch (error) {
    console.error("Follow mosque error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /me/mosques/:mosqueId - unfollow mosque
router.delete("/me/mosques/:mosqueId", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const mosqueId = req.params.mosqueId;

    const existing = await prisma.userMosque.findUnique({
      where: {
        userId_mosqueId: { userId, mosqueId },
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Not following this mosque" });
      return;
    }

    await prisma.userMosque.delete({
      where: {
        userId_mosqueId: { userId, mosqueId },
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Unfollow mosque error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
