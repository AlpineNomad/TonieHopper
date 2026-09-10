#!/usr/bin/env python3
"""Build the static TeddyCloud plugin without bundling personal configuration."""

import argparse
import json
from pathlib import Path
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / "plugin" / "toniehopper"


def build(output):
    for name in ("index.html", "plugin.json"):
        if not (PLUGIN / name).is_file():
            raise ValueError("Plugin-Datei fehlt: " + str(PLUGIN / name))
    metadata = json.loads((PLUGIN / "plugin.json").read_text(encoding="utf-8"))
    if not metadata.get("pluginName") or not metadata.get("version"):
        raise ValueError("plugin.json braucht pluginName und version.")

    files = []
    for path in sorted(PLUGIN.rglob("*")):
        relative = path.relative_to(PLUGIN)
        if path.is_symlink():
            raise ValueError("Symlinks werden nicht veröffentlicht: " + str(relative))
        if any(part.startswith(".") for part in relative.parts):
            continue
        if relative.as_posix() == "config.json":
            raise ValueError("Persönliche config.json darf nicht ins Plugin-Paket.")
        if path.is_file():
            files.append((path, "toniehopper/" + relative.as_posix()))

    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".zip", delete=False) as file:
            temporary = Path(file.name)
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path, archive_name in files:
                entry = zipfile.ZipInfo(archive_name, date_time=(2026, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, path.read_bytes())
        temporary.replace(output)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    print("Plugin: " + str(output))
    print(str(len(files)) + " Dateien; persönliche Konfiguration bleibt außerhalb des Pakets.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "toniehopper.zip")
    args = parser.parse_args()
    try:
        build(args.output)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
