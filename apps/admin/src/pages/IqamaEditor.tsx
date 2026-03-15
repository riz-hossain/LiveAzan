import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface IqamaFormData {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  jummah: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const inputStyle: React.CSSProperties = {
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
  width: 120,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid #eee",
};

// Mock mosque list for the dropdown
const mockMosques = [
  { id: "1", name: "Masjid Toronto" },
  { id: "2", name: "Ottawa Mosque" },
  { id: "3", name: "Al Rashid Mosque" },
  { id: "4", name: "MAC Waterloo" },
  { id: "5", name: "BCMA Richmond" },
];

export default function IqamaEditor() {
  const { id } = useParams<{ id: string }>();
  const [selectedMosque, setSelectedMosque] = useState(id || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<IqamaFormData>({
    fajr: "06:30",
    dhuhr: "13:30",
    asr: "17:30",
    maghrib: "sunset+5",
    isha: "21:00",
    jummah: "13:30",
    effectiveFrom: new Date().toISOString().split("T")[0],
    effectiveTo: "",
  });

  useEffect(() => {
    if (!selectedMosque) return;

    // TODO: Fetch existing iqama times — GET /api/iqama/:mosqueId
    const fetchIqama = async () => {
      try {
        const res = await fetch(`/api/iqama/${selectedMosque}`);
        if (res.ok) {
          const data = await res.json();
          setForm((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // API not available — keep defaults
      }
    };

    fetchIqama();
  }, [selectedMosque]);

  const handleChange = (field: keyof IqamaFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/iqama/${selectedMosque}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSaved(true);
      } else {
        alert("Failed to save. Check the console for details.");
      }
    } catch {
      alert("Could not reach the server. Is it running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2>Edit Iqama Times</h2>
      <p style={{ color: "#666", margin: "8px 0 24px" }}>
        Update the iqama schedule for a mosque.
      </p>

      {/* Mosque selector */}
      <div style={{ marginBottom: 24 }}>
        <label>
          <strong>Mosque: </strong>
          <select
            value={selectedMosque}
            onChange={(e) => setSelectedMosque(e.target.value)}
            style={{ ...inputStyle, width: 260 }}
          >
            <option value="">-- Select a mosque --</option>
            {mockMosques.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedMosque && (
        <form
          onSubmit={handleSave}
          style={{ background: "#fff", padding: 24, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 500 }}
        >
          <h3 style={{ marginBottom: 16 }}>Prayer Times</h3>

          {(["fajr", "dhuhr", "asr", "maghrib", "isha", "jummah"] as const).map(
            (prayer) => (
              <div key={prayer} style={labelStyle}>
                <span style={{ textTransform: "capitalize", fontWeight: 500 }}>
                  {prayer}
                </span>
                <input
                  type="text"
                  value={form[prayer]}
                  onChange={(e) => handleChange(prayer, e.target.value)}
                  placeholder="HH:mm or sunset+N"
                  style={inputStyle}
                />
              </div>
            )
          )}

          <h3 style={{ margin: "24px 0 16px" }}>Effective Dates</h3>

          <div style={labelStyle}>
            <span style={{ fontWeight: 500 }}>From</span>
            <input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => handleChange("effectiveFrom", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={labelStyle}>
            <span style={{ fontWeight: 500 }}>To (optional)</span>
            <input
              type="date"
              value={form.effectiveTo}
              onChange={(e) => handleChange("effectiveTo", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 16 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 24px",
                background: "#16213e",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: 15,
              }}
            >
              {saving ? "Saving..." : "Save Iqama Times"}
            </button>
            {saved && (
              <span style={{ color: "#2a9d8f", fontWeight: 500 }}>Saved successfully!</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
