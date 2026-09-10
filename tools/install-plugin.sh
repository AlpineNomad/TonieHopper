#!/bin/sh
# Install into existing, locally accessible TeddyCloud volume directories.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
source_dir="$project_dir/plugin/toniehopper"
plugins_dir=
config_dir=
container_config_dir=
config_mode=copy
import_config=

usage() {
    cat <<'USAGE'
Auf dem TeddyCloud-Host oder mit lokal eingebundenen Volumes ausführen:
  sh tools/install-plugin.sh --plugins-dir PFAD --config-dir PFAD [Optionen]

  --plugins-dir PFAD          Bestehender plugins-Ordner auf diesem Rechner
  --config-dir PFAD           Bestehender config-Ordner auf diesem Rechner
  --config-mode copy|link     Veröffentlichung als normale Datei (Standard:
                             copy, funktioniert auch auf SMB) oder Symlink
  --container-config-dir PFAD config-Ordner aus Sicht des Containers
                             (nur für link; Standard: --config-dir)
  --source PFAD               Entpackter toniehopper-Plugin-Ordner
  --import-config DATEI       Exportierte Konfiguration übernehmen;
                             bestehende Konfiguration wird vorher gesichert

Ohne --import-config wird eine bestehende Konfiguration nie ersetzt.
Im Modus copy wird ihre veröffentlichte Kopie bei jedem Lauf aktualisiert.
Das Skript greift weder auf Docker noch auf einen entfernten Host zu.
USAGE
}

die() { printf '%s\n' "$*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
    case "$1" in
        --help|-h) usage; exit 0 ;;
        --plugins-dir|--config-dir|--container-config-dir|--config-mode|--source|--import-config)
            [ "$#" -ge 2 ] || die "Wert fehlt für $1"
            case "$1" in
                --plugins-dir) plugins_dir=$2 ;;
                --config-dir) config_dir=$2 ;;
                --container-config-dir) container_config_dir=$2 ;;
                --config-mode) config_mode=$2 ;;
                --source) source_dir=$2 ;;
                --import-config) import_config=$2 ;;
            esac
            shift 2 ;;
        *) die "Unbekannte Option: $1" ;;
    esac
done

case "$config_mode" in copy|link) ;; *) die "--config-mode muss copy oder link sein." ;; esac
[ -n "$plugins_dir" ] && [ -n "$config_dir" ] || { usage >&2; exit 1; }
[ -d "$plugins_dir" ] || die "plugins-Ordner fehlt: $plugins_dir"
[ -d "$config_dir" ] || die "config-Ordner fehlt: $config_dir"
[ -d "$source_dir" ] || die "Plugin-Quelle fehlt: $source_dir"
plugins_dir=$(CDPATH= cd -- "$plugins_dir" && pwd -P)
config_dir=$(CDPATH= cd -- "$config_dir" && pwd -P)
source_dir=$(CDPATH= cd -- "$source_dir" && pwd -P)
case "$config_dir/" in "$plugins_dir/"*) die "Der config-Ordner muss außerhalb des plugins-Ordners liegen." ;; esac
[ -n "$container_config_dir" ] || container_config_dir=$config_dir
case "$container_config_dir" in /*) ;; *) die "Container-Pfad muss absolut sein." ;; esac
container_config_dir=${container_config_dir%/}

target_dir="$plugins_dir/toniehopper"
config_file="$config_dir/toniehopper.json"
[ "$source_dir" != "$target_dir" ] || die "Quelle und Ziel dürfen nicht identisch sein."
[ -f "$source_dir/plugin.json" ] && [ -f "$source_dir/index.html" ] || die "plugin.json oder index.html fehlt."
[ ! -L "$target_dir" ] || die "Installationsziel darf kein Symlink sein: $target_dir"
[ ! -e "$target_dir" ] || [ -d "$target_dir" ] || die "Installationsziel ist kein Ordner."
[ ! -L "$config_file" ] || die "Konfigurationsdatei darf kein Symlink sein: $config_file"
[ ! -e "$config_file" ] || [ -f "$config_file" ] || die "Konfiguration ist keine reguläre Datei."
[ ! -e "$source_dir/config.json" ] && [ ! -L "$source_dir/config.json" ] || die "Plugin-Quelle enthält eine persönliche config.json."

config_input=
if [ -n "$import_config" ]; then
    [ -f "$import_config" ] || die "Exportierte Konfiguration fehlt: $import_config"
    config_input=$import_config
elif [ ! -f "$config_file" ]; then
    config_input="$project_dir/config/toniehopper.json"
    [ -f "$config_input" ] || die "Startkonfiguration fehlt. --import-config angeben."
fi

backup_root="$config_dir/toniehopper-backups"
[ ! -L "$backup_root" ] || die "Sicherungsordner darf kein Symlink sein."
backup_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-$$"
stage_dir=
config_stage=
moved_previous=no
installed=no
cleanup() {
    result=$?
    trap - EXIT HUP INT TERM
    if [ -n "$stage_dir" ] && [ -d "$stage_dir" ]; then rm -rf -- "$stage_dir"; fi
    if [ -n "$config_stage" ] && [ -f "$config_stage" ]; then rm -f -- "$config_stage"; fi
    if [ "$moved_previous" = yes ] && [ "$installed" = no ] && [ ! -e "$target_dir" ]; then
        mv -- "$backup_dir/plugin" "$target_dir" || true
    fi
    exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

stage_dir=$(mktemp -d "$plugins_dir/.toniehopper-install.XXXXXX")
cp -R "$source_dir/." "$stage_dir/"
chmod 755 "$stage_dir"
if [ "$config_mode" = link ]; then
    ln -s "$container_config_dir/toniehopper.json" "$stage_dir/config.json"
else
    published_config=$config_file
    [ -z "$config_input" ] || published_config=$config_input
    cp "$published_config" "$stage_dir/config.json"
    chmod 644 "$stage_dir/config.json"
fi

if [ -n "$config_input" ]; then
    config_stage=$(mktemp "$config_dir/.toniehopper-config.XXXXXX")
    cp "$config_input" "$config_stage"
    # Configuration contains only public profile and library metadata, no secrets.
    chmod 644 "$config_stage"
    if [ -f "$config_file" ]; then
        mkdir -p "$backup_dir"
        cp -p "$config_file" "$backup_dir/toniehopper.json"
    fi
    mv -- "$config_stage" "$config_file"
    config_stage=
fi

if [ -d "$target_dir" ]; then
    mkdir -p "$backup_dir"
    mv -- "$target_dir" "$backup_dir/plugin"
    moved_previous=yes
fi
mv -- "$stage_dir" "$target_dir"
stage_dir=
installed=yes

printf 'Installiert: %s\nKonfiguration: %s\n' "$target_dir" "$config_file"
if [ "$config_mode" = copy ]; then
    printf 'Veröffentlicht: config.json als normale Datei; nach Änderungen dieses Skript erneut ausführen.\n'
else
    printf 'Veröffentlicht: config.json als Symlink; Lesbarkeit über TeddyCloud prüfen.\n'
fi
printf 'Direkter Aufruf: /plugins/toniehopper/index.html\n'
if [ -d "$backup_dir" ]; then printf 'Vorheriger Stand: %s\n' "$backup_dir"; fi
