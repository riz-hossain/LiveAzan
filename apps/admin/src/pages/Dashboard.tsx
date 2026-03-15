import React, { useEffect, useState } from "react";

interface Stats {
  totalMosques: number;
  totalUsers: number;
  pendingRequests: number;
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  flex: "1 1 200px",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalMosques: 0,
    totalUsers: 0,
    pendingRequests: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with real API call — GET /api/admin/stats
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (res.ok) {
          setStats(await res.json());
        } else {
          // Fallback mock data for development
          setStats({ totalMosques: 41, totalUsers: 0, pendingRequests: 3 });
        }
      } catch {
        // API not available — use mock data
        setStats({ totalMosques: 41, totalUsers: 0, pendingRequests: 3 });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return <p>Loading dashboard...</p>;
  }

  return (
    <div>
      <h2>Dashboard</h2>
      <p style={{ color: "#666", margin: "8px 0 24px" }}>
        Overview of the LiveAzan platform.
      </p>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#16213e" }}>
            {stats.totalMosques}
          </div>
          <div style={{ color: "#666", marginTop: 4 }}>Total Mosques</div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#16213e" }}>
            {stats.totalUsers}
          </div>
          <div style={{ color: "#666", marginTop: 4 }}>Total Users</div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#e76f51" }}>
            {stats.pendingRequests}
          </div>
          <div style={{ color: "#666", marginTop: 4 }}>Pending Coverage Requests</div>
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ ...cardStyle, flex: "unset" }}>
        <h3 style={{ marginBottom: 12 }}>Recent Activity</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            Seed data loaded for 10 Canadian cities (41 mosques)
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            Coverage request received: Victoria, BC
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            Iqama times updated for Masjid Toronto
          </li>
          <li style={{ padding: "8px 0" }}>
            New region scan completed: Waterloo, ON
          </li>
        </ul>
      </div>
    </div>
  );
}
