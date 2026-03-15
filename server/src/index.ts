import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import mosqueRoutes from "./routes/mosques";
import iqamaRoutes from "./routes/iqama";
import prayerTimesRoutes from "./routes/prayerTimes";
import userRoutes from "./routes/users";
import coverageRequestRoutes from "./routes/coverageRequests";
import submissionRoutes from "./routes/submissions";
import adminRoutes from "./routes/admin";
import { startIqamaRefreshJob } from "./jobs/iqamaRefreshJob";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/mosques", mosqueRoutes);
app.use("/api/iqama", iqamaRoutes);
app.use("/api/prayer-times", prayerTimesRoutes);
app.use("/api/users", userRoutes);
app.use("/api/coverage-requests", coverageRequestRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/admin", adminRoutes);

// Error handler middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`LiveAzan server running on port ${PORT}`);
  if (process.env.NODE_ENV === "production") {
    startIqamaRefreshJob();
  }
});

export default app;
