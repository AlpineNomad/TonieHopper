#!/usr/bin/env python3
"""Generate the plugin's small, same-host age lookup from a pinned public catalog.

Only factual article identifiers and recommended ages are retained, without
titles, descriptions, artwork, or personal TeddyCloud data. Upstream's default
age of 99 means unknown, not a recommendation for 99-year-olds. Conflicting or
partly unknown editions sharing an article remain unknown.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.request import urlopen


REPOSITORY = "https://github.com/toniebox-reverse-engineering/tonies-json"
DEFAULT_REVISION = "30833370836ad94221efeeb88bc92bf37ccc3745"
DEFAULT_SOURCE_DATE = "2026-09-10T10:15:31Z"
OUTPUT = Path(__file__).resolve().parents[1] / "plugin/toniehopper/assets/ages.json"


def age_value(value):
    # bool is an int subclass in Python but is not a usable recommendation.
    return value if type(value) is int and 0 <= value <= 18 else None


def build(data):
    if not isinstance(data, list):
        raise ValueError("Expected the toniesV2 catalog array")
    collected = {}
    for item in data:
        if not isinstance(item, dict) or not isinstance(item.get("article"), str):
            continue
        model = item["article"].strip()
        entries = item.get("data")
        if not model or not isinstance(entries, list):
            continue
        values = [age_value(entry.get("age")) if isinstance(entry, dict) else None for entry in entries]
        collected.setdefault(model, []).extend(values or [None])
    models = {}
    for model, values in sorted(collected.items()):
        if values[0] is not None and all(value == values[0] for value in values):
            models[model] = values[0]
    if not models:
        raise ValueError("Catalog contains no usable age recommendations")
    return models


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", default=DEFAULT_REVISION, help="Full upstream release commit SHA")
    parser.add_argument("--source-date", help="Date of the upstream commit, ISO 8601")
    parser.add_argument("--input", type=Path, help="Read a previously downloaded snapshot instead of downloading")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.revision):
        parser.error("--revision must be a full commit SHA")
    url = "https://raw.githubusercontent.com/toniebox-reverse-engineering/tonies-json/" + args.revision + "/toniesV2.json"
    raw = args.input.read_bytes() if args.input else urlopen(url, timeout=60).read()
    models = build(json.loads(raw))
    result = {
        "version": 1,
        "source": REPOSITORY,
        "sourceFile": url,
        "sourceRevision": args.revision,
        "sourceDate": args.source_date or (DEFAULT_SOURCE_DATE if args.revision == DEFAULT_REVISION else None),
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "models": models,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(str(len(models)) + " model age recommendations written to " + str(args.output))


if __name__ == "__main__":
    main()
