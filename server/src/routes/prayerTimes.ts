import { Router, Request, Response } from "express";
import { fetchPrayerTimes } from "../services/aladhanService";

const router = Router();

// GET / - get prayer times for a location
router.get("/", async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      res.status(400).json({ error: "lat and lon query parameters are required" });
      return;
    }

    const date = (req.query.date as string) || undefined;
    const method = req.query.method ? parseInt(req.query.method as string, 10) : 2;

    if (isNaN(method)) {
      res.status(400).json({ error: "method must be a valid number" });
      return;
    }

    const prayerTimes = await fetchPrayerTimes(lat, lon, date, method);
    res.json(prayerTimes);
  } catch (error) {
    console.error("Prayer times error:", error);
    res.status(500).json({ error: "Failed to fetch prayer times" });
  }
});

export default router;
