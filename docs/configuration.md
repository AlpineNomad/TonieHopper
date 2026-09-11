# Konfiguration

Die Vorlage `config/toniehopper.json` enthält keine Kinder und keine ausgeschlossenen Geschichten. Die eigentliche Konfiguration liegt im Config-Volume der eigenen TeddyCloud.

| Feld | Bedeutung |
| --- | --- |
| `version` | Formatversion, aktuell `2` |
| `profiles` | Kinderprofile mit `id`, `name`, `ruid` und `overlay` |
| `ruid` | Vollständige Kennung der tatsächlichen Zielfigur aus TeddyCloud |
| `overlay` | TeddyCloud-Box-Kennung für den Inhaltsbereich oder `null` für den Standardbereich |
| `library.path` | Ausgangsordner der TAF-Bibliothek, standardmäßig `/` |
| `library.hiddenSources` | Für alle Kinder ausgeblendete Quellen; leer bedeutet alle anzeigen |
| `library.entries` | Zusätzliche Metadaten eigener Inhalte: `source`, `title`, `series`, `cover` |

Echte Figuren immer über den Elternbereich auswählen. Ein Name oder Modell bezeichnet die Figur nicht eindeutig: Mehrere physische Figuren können dasselbe Modell haben. Die Suchliste zeigt deshalb ihre vollständigen Kennungen.

Im Kinderprofil bietet TonieHopper zuerst **Nicht zugeordnet** und danach alle von TeddyCloud gemeldeten Boxen zur Auswahl an. Bei einer Box-Zuordnung lädt der Figurensucher nur die Figuren aus diesem TeddyCloud-Overlay. Nach Auswahl eines Kindes zeigt das Regal **Tonies** ebenfalls nur Geschichten, die im Inhaltsbereich dieser Box vorkommen. **Nicht zugeordnet** verwendet jeweils den Standardbereich.

## Entwurf und zentrale Datei

TeddyCloud stellt keinen allgemeinen Schreibendpunkt für beliebige Dateien im Config-Ordner bereit. Änderungen im Elternbereich werden als Entwurf exportiert. Erst der explizite Import mit `tools/install-plugin.sh --import-config DATEI` aktiviert sie für alle Geräte.

Die Veröffentlichung erfolgt als normale Kopie:

```text
config/toniehopper.json
    → Installationsskript
    → data/www/plugins/toniehopper/config.json
```

Bei jedem Installationslauf wird die öffentliche Kopie aus der zentralen Datei erneuert. Ohne `--import-config` bleibt eine vorhandene zentrale Konfiguration unverändert. Beim expliziten Import wird die bisherige Konfiguration gesichert.

Nach einer manuellen Änderung der zentralen Datei das Installationsskript erneut ohne `--import-config` ausführen und die App neu laden. Reines Entpacken des ZIP-Pakets veröffentlicht keine Konfiguration.

Die veröffentlichte Datei enthält Profil- und Bibliotheksdaten und ist für Geräte erreichbar, die das Plugin öffnen können. Zugangsdaten gehören nicht hinein. Eigene Exporte nicht in das öffentliche Repository aufnehmen; stattdessen beispielsweise `.local/toniehopper.json` verwenden.

## Sichtbarkeit

Alle neuen Geschichten sind zunächst sichtbar, sofern sie zum Inhaltsbereich der jeweiligen Box gehören oder Teil der gemeinsamen eigenen Hörwelt sind. Im Reiter **Geschichten** bedeutet ein Haken **Für alle Kinder ausgeblendet**. Diese Auswahl gilt gemeinsam für sämtliche Kinder, einschließlich erkannter Kopien derselben Geschichte.

Der Altersfilter in der Hörwelt ist ein Ansichtsfilter und ändert diese Freigaben nicht. Er lässt sich mit der Textsuche kombinieren und gilt für beide Regale. Ein Kindwechsel setzt ihn auf **Alle Altersstufen** zurück. Fehlende Alterswerte werden nicht als null Jahre behandelt.

## Bisheriges Format

Konfigurationen mit `version: 1` werden beim Einlesen geprüft und in Format 2 übernommen. Kinder und ihre Figuren bleiben erhalten. Frühere Listen `approvedSources` und `allowedSources` entfallen und werden nicht zu Ausschlüssen umgedeutet. Nach der Migration sind zunächst alle Geschichten sichtbar. Der nächste Export schreibt Format 2.

## SMB und lokale Linux-Dateisysteme

`--config-mode copy` ist der Standard und funktioniert auch über SMB. Einige Freigaben speichern symbolische Links als spezielle Dateien, die der Container nicht als Link erkennt.

Auf einem lokalen Linux-Dateisystem kann optional `--config-mode link --container-config-dir PFAD` verwendet werden. Dabei muss `PFAD` die tatsächliche Config-Adresse aus Sicht des Containers sein. Anschließend prüfen, dass `/plugins/toniehopper/config.json` über TeddyCloud gültiges JSON liefert.
