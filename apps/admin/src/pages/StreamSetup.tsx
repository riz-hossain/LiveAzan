import React from "react";

const placeholderCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 32,
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  maxWidth: 600,
  textAlign: "center",
};

const mockupBoxStyle: React.CSSProperties = {
  border: "2px dashed #ccc",
  borderRadius: 8,
  padding: 24,
  marginTop: 24,
  color: "#999",
};

export default function StreamSetup() {
  return (
    <div>
      <h2>Live Azan Streaming Setup</h2>
      <p style={{ color: "#666", margin: "8px 0 24px" }}>
        Configure live azan audio streams for mosques.
      </p>

      <div style={placeholderCardStyle}>
        <div
          style={{
            display: "inline-block",
            background: "#e9ecef",
            padding: "8px 16px",
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 600,
            color: "#666",
            marginBottom: 16,
          }}
        >
          Coming in Phase 6
        </div>

        <h3 style={{ marginBottom: 8 }}>Azan Live Stream Manager</h3>
        <p style={{ color: "#888", lineHeight: 1.6 }}>
          This feature will allow mosque administrators to set up live audio
          streams for azan broadcasts. Users following a mosque will receive
          real-time azan audio when it begins.
        </p>

        {/* Mockup of what it will look like */}
        <div style={mockupBoxStyle}>
          <p style={{ fontWeight: 600, marginBottom: 16 }}>Stream Configuration (mockup)</p>

          <div style={{ textAlign: "left", maxWidth: 400, margin: "0 auto" }}>
            <div style={{ padding: "8px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <span>Stream URL</span>
              <span style={{ color: "#aaa" }}>rtmp://stream.liveaszan.com/...</span>
            </div>
            <div style={{ padding: "8px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <span>Stream Key</span>
              <span style={{ color: "#aaa" }}>sk_live_xxxxxxxx</span>
            </div>
            <div style={{ padding: "8px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <span>Status</span>
              <span style={{ color: "#aaa" }}>Offline</span>
            </div>
            <div style={{ padding: "8px 0", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
              <span>Auto-detect Azan</span>
              <span style={{ color: "#aaa" }}>Enabled</span>
            </div>
            <div style={{ padding: "8px 0", display: "flex", justifyContent: "space-between" }}>
              <span>Linked Mosque</span>
              <span style={{ color: "#aaa" }}>Masjid Toronto</span>
            </div>
          </div>

          <button
            disabled
            style={{
              marginTop: 20,
              padding: "10px 24px",
              background: "#ccc",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "not-allowed",
              fontSize: 14,
            }}
          >
            Save Stream Config
          </button>
        </div>
      </div>
    </div>
  );
}
