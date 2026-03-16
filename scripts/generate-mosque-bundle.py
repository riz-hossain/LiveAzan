#!/usr/bin/env python3
"""
Generate /apps/mobile/assets/data/mosques-index.json

Merges all /data/mosques/**/*.json files (skipping _meta/) into a single
flat JSON array that the mobile app bundles for offline use.

Usage:
    python scripts/generate-mosque-bundle.py
"""

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).parent.parent
DATA_DIR = REPO / "data" / "mosques"
OUT_DIR = REPO / "apps" / "mobile" / "assets" / "data"
OUT_FILE = OUT_DIR / "mosques-index.json"


def slugify(text: str) -> str:
    """Lowercase, replace spaces/special chars with underscores."""
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def is_valid_time(t: str) -> bool:
    """Returns True if t looks like HH:mm (not 'sunset+X' etc.)."""
    return bool(re.match(r"^\d{1,2}:\d{2}$", t.strip()))


def build_iqama_times(raw: dict) -> dict:
    """Filter iqamaTimes to only include valid HH:mm entries."""
    keys = ("fajr", "dhuhr", "asr", "maghrib", "isha", "jummah")
    result = {}
    for k in keys:
        v = raw.get(k)
        if v and isinstance(v, str) and is_valid_time(v):
            result[k] = v
    return result


def process_file(json_file: Path) -> list:
    """Read one city JSON file and return a list of flattened mosque records."""
    try:
        data = json.loads(json_file.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  WARNING: could not read {json_file}: {e}", file=sys.stderr)
        return []

    mosques = data.get("mosques", [])
    if not isinstance(mosques, list):
        return []

    province_slug = slugify(data.get("province", "unknown"))
    city_slug = slugify(data.get("region", json_file.stem))

    records = []
    for i, m in enumerate(mosques):
        name = m.get("name", "").strip()
        if not name:
            continue

        # Normalise type to uppercase ("mosque" -> "MOSQUE")
        raw_type = m.get("type", "mosque")
        mosque_type = raw_type.upper() if isinstance(raw_type, str) else "MOSQUE"

        # Country: use the mosque-level value if present, fall back to file-level
        country = m.get("country") or data.get("country") or "Canada"
        # Capitalise first letter
        country = country.capitalize()

        iqama_times = build_iqama_times(m.get("iqamaTimes") or {})

        services = m.get("services")
        facilities = m.get("facilities")

        record = {
            "id": f"local_{province_slug}_{city_slug}_{i}",
            "name": name,
            "type": mosque_type,
            "address": m.get("address", ""),
            "city": m.get("city", data.get("region", "")),
            "province": m.get("province", data.get("province", "")),
            "country": country,
            "latitude": m.get("latitude", 0.0),
            "longitude": m.get("longitude", 0.0),
            "phone": m.get("phone") or None,
            "website": m.get("website") or None,
            "hasLiveStream": bool(m.get("hasLiveStream", False)),
            "verified": bool(m.get("verified", True)),
            "iqamaTimes": iqama_times,
            "description": m.get("description") or None,
            "denomination": m.get("denomination") or None,
            "hours": m.get("hours") or None,
            "accessInfo": m.get("accessInfo") or None,
            "services": services if isinstance(services, list) else [],
            "facilities": facilities if isinstance(facilities, list) else [],
        }
        records.append(record)

    return records


def main():
    print(f"Scanning {DATA_DIR} ...")

    all_mosques = []
    json_files = sorted(DATA_DIR.rglob("*.json"))

    for f in json_files:
        # Skip _meta directory
        if "_meta" in f.parts:
            continue
        records = process_file(f)
        if records:
            print(f"  {f.relative_to(REPO)}: {len(records)} mosques")
            all_mosques.extend(records)

    # Create output directory
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    OUT_FILE.write_text(
        json.dumps(all_mosques, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_with_iqama = sum(1 for m in all_mosques if m["iqamaTimes"])
    print(f"\nDone. {len(all_mosques)} mosques written to {OUT_FILE.relative_to(REPO)}")
    print(f"  {total_with_iqama} have iqama times, {len(all_mosques) - total_with_iqama} do not.")


if __name__ == "__main__":
    main()
