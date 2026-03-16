/**
 * DebugPanel — testing-phase component for the mosques screen.
 *
 * Lets you independently test each mosque data source on the device
 * without needing a computer or console. Shows a live log and per-source
 * result counts. Remove or hide once testing is complete.
 */

import { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { fetchMosquesNearby } from "../services/api";
import { searchLocalMosques } from "../services/localMosqueSearch";
import { searchNearby } from "../services/mawaqitService";
import { searchOverpassMosques } from "../services/overpassService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceResult {
  label: string;
  status: "idle" | "loading" | "ok" | "error";
  count?: number;
  error?: string;
}

interface Props {
  lat: number | null;
  lon: number | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DebugPanel({ lat, lon }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState<Record<string, SourceResult>>({
    backend: { label: "Backend API", status: "idle" },
    local: { label: "Local Bundle", status: "idle" },
    mawaqit: { label: "MAWAQIT", status: "idle" },
    overpass: { label: "Overpass (OSM)", status: "idle" },
  });
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 30));
  };

  const setLoading = (key: string) =>
    setResults((r) => ({ ...r, [key]: { ...r[key], status: "loading" } }));

  const setOk = (key: string, count: number) => {
    setResults((r) => ({ ...r, [key]: { ...r[key], status: "ok", count } }));
    addLog(`${results[key].label}: ✓ ${count} mosques`);
  };

  const setError = (key: string, err: string) => {
    setResults((r) => ({ ...r, [key]: { ...r[key], status: "error", error: err } }));
    addLog(`${results[key].label}: ✗ ${err}`);
  };

  const testBackend = async () => {
    if (!lat || !lon) { addLog("Backend: no location"); return; }
    setLoading("backend");
    addLog("Backend: testing...");
    try {
      const res = await fetchMosquesNearby(lat, lon, 25);
      setOk("backend", res.mosques.length);
    } catch (e: any) {
      setError("backend", e?.message ?? "unreachable");
    }
  };

  const testLocal = () => {
    if (!lat || !lon) { addLog("Local: no location"); return; }
    setLoading("local");
    addLog("Local: searching bundle...");
    try {
      const mosques = searchLocalMosques(lat, lon, 25);
      setOk("local", mosques.length);
    } catch (e: any) {
      setError("local", e?.message ?? "failed");
    }
  };

  const testMawaqit = async () => {
    if (!lat || !lon) { addLog("MAWAQIT: no location"); return; }
    setLoading("mawaqit");
    addLog("MAWAQIT: querying...");
    try {
      const mosques = await searchNearby(lat, lon, 25000);
      setOk("mawaqit", mosques.length);
    } catch (e: any) {
      setError("mawaqit", e?.message ?? "failed");
    }
  };

  const testOverpass = async () => {
    if (!lat || !lon) { addLog("Overpass: no location"); return; }
    setLoading("overpass");
    addLog("Overpass: querying OSM...");
    try {
      const mosques = await searchOverpassMosques(lat, lon, 25);
      setOk("overpass", mosques.length);
    } catch (e: any) {
      setError("overpass", e?.message ?? "failed");
    }
  };

  const handlers: Record<string, () => void> = {
    backend: testBackend,
    local: testLocal,
    mawaqit: testMawaqit,
    overpass: testOverpass,
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((e) => !e)}
      >
        <Text style={styles.headerText}>
          🔧 Debug Panel {expanded ? "▲" : "▼"}
        </Text>
        {!lat && <Text style={styles.noLocation}>No location</Text>}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {lat && lon && (
            <Text style={styles.location}>
              📍 {lat.toFixed(4)}, {lon.toFixed(4)}
            </Text>
          )}

          <View style={styles.buttons}>
            {Object.entries(results).map(([key, r]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.btn,
                  r.status === "ok" && styles.btnOk,
                  r.status === "error" && styles.btnError,
                  r.status === "loading" && styles.btnLoading,
                ]}
                onPress={handlers[key]}
                disabled={r.status === "loading"}
              >
                {r.status === "loading" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnText}>
                    {r.status === "ok" && "✓ "}
                    {r.status === "error" && "✗ "}
                    {r.label}
                    {r.status === "ok" && `: ${r.count}`}
                    {r.status === "error" && `: ${r.error}`}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {logs.length > 0 && (
            <ScrollView style={styles.logBox} nestedScrollEnabled>
              {logs.map((line, i) => (
                <Text key={i} style={styles.logLine}>{line}</Text>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f59e0b",
    backgroundColor: "#fffbeb",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fef3c7",
  },
  headerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
  },
  noLocation: {
    fontSize: 11,
    color: "#ef4444",
  },
  body: {
    padding: 10,
    gap: 8,
  },
  location: {
    fontSize: 11,
    color: "#78716c",
    fontFamily: "monospace",
  },
  buttons: {
    gap: 6,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#6b7280",
    alignItems: "center",
  },
  btnOk: { backgroundColor: "#16a34a" },
  btnError: { backgroundColor: "#dc2626" },
  btnLoading: { backgroundColor: "#9ca3af" },
  btnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  logBox: {
    maxHeight: 120,
    backgroundColor: "#1c1917",
    borderRadius: 4,
    padding: 6,
  },
  logLine: {
    color: "#d6d3d1",
    fontSize: 10,
    fontFamily: "monospace",
    lineHeight: 16,
  },
});
