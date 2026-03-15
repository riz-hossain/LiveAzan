import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import IqamaEditor from "./pages/IqamaEditor";
import StreamSetup from "./pages/StreamSetup";

// ---------------------------------------------------------------------------
// Minimal inline styles (no CSS framework needed for scaffold)
// ---------------------------------------------------------------------------

const layoutStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
};

const sidebarStyle: React.CSSProperties = {
  width: 220,
  background: "#1a1a2e",
  color: "#eee",
  padding: "24px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const linkStyle: React.CSSProperties = {
  color: "#ccc",
  textDecoration: "none",
  padding: "8px 12px",
  borderRadius: 6,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: 32,
};

// ---------------------------------------------------------------------------
// Placeholder pages
// ---------------------------------------------------------------------------

function Login() {
  return (
    <div style={{ maxWidth: 400, margin: "120px auto", textAlign: "center" }}>
      <h1>LiveAzan Admin</h1>
      <p style={{ margin: "16px 0", color: "#666" }}>
        Sign in to manage mosques, iqama times, and coverage requests.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // TODO: POST /api/auth/login — for now just redirect
          window.location.href = "/dashboard";
        }}
      >
        <input
          type="email"
          placeholder="admin@liveaszan.com"
          style={{ display: "block", width: "100%", padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid #ccc" }}
        />
        <input
          type="password"
          placeholder="Password"
          style={{ display: "block", width: "100%", padding: 10, marginBottom: 16, borderRadius: 6, border: "1px solid #ccc" }}
        />
        <button
          type="submit"
          style={{ width: "100%", padding: 12, background: "#16213e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 16 }}
        >
          Sign In
        </button>
      </form>
    </div>
  );
}

function MosqueList() {
  // TODO: Fetch from GET /api/mosques
  const mockMosques = [
    { id: "1", name: "Masjid Toronto", city: "Toronto" },
    { id: "2", name: "Ottawa Mosque", city: "Ottawa" },
    { id: "3", name: "Al Rashid Mosque", city: "Edmonton" },
  ];

  return (
    <div>
      <h2>Mosques</h2>
      <p style={{ color: "#666", margin: "8px 0 24px" }}>
        Manage registered mosques and their iqama schedules.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>City</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {mockMosques.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{m.name}</td>
              <td style={{ padding: 8 }}>{m.city}</td>
              <td style={{ padding: 8 }}>
                <Link to={`/mosques/${m.id}/iqama`} style={{ color: "#16213e" }}>
                  Edit Iqama
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageRequests() {
  // TODO: Fetch from GET /api/coverage-requests
  return (
    <div>
      <h2>Coverage Requests</h2>
      <p style={{ color: "#666", margin: "8px 0 24px" }}>
        Users requesting mosque coverage in new areas.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: 8 }}>City</th>
            <th style={{ padding: 8 }}>Province</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: 8 }}>Victoria</td>
            <td style={{ padding: 8 }}>British Columbia</td>
            <td style={{ padding: 8 }}>
              <span style={{ background: "#fff3cd", padding: "2px 8px", borderRadius: 4, fontSize: 13 }}>
                PENDING
              </span>
            </td>
            <td style={{ padding: 8 }}>
              <button style={{ padding: "4px 12px", marginRight: 8, cursor: "pointer" }}>
                Approve
              </button>
              <button style={{ padding: "4px 12px", cursor: "pointer" }}>
                Reject
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={layoutStyle}>
      <nav style={sidebarStyle}>
        <h2 style={{ fontSize: 18, marginBottom: 24 }}>LiveAzan Admin</h2>
        <Link to="/dashboard" style={linkStyle}>Dashboard</Link>
        <Link to="/mosques" style={linkStyle}>Mosques</Link>
        <Link to="/coverage-requests" style={linkStyle}>Coverage Requests</Link>
        <Link to="/stream-setup" style={linkStyle}>Stream Setup</Link>
        <div style={{ marginTop: "auto" }}>
          <Link to="/login" style={{ ...linkStyle, fontSize: 13 }}>Sign Out</Link>
        </div>
      </nav>
      <main style={contentStyle}>{children}</main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Router
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <AdminLayout>
              <Dashboard />
            </AdminLayout>
          }
        />
        <Route
          path="/mosques"
          element={
            <AdminLayout>
              <MosqueList />
            </AdminLayout>
          }
        />
        <Route
          path="/mosques/:id/iqama"
          element={
            <AdminLayout>
              <IqamaEditor />
            </AdminLayout>
          }
        />
        <Route
          path="/coverage-requests"
          element={
            <AdminLayout>
              <CoverageRequests />
            </AdminLayout>
          }
        />
        <Route
          path="/stream-setup"
          element={
            <AdminLayout>
              <StreamSetup />
            </AdminLayout>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
