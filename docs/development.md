# Entwicklung

Das Plugin besteht aus statischem HTML, CSS und ES5-JavaScript. Python wird nur für lokale Werkzeuge benötigt. Die installierte App verwendet XMLHttpRequest und lokale Assets, damit sie auch auf älteren iPads läuft.

## Offline-Demo und Screenshots

```sh
python3 tools/serve-demo.py
```

Die Demo auf `http://127.0.0.1:8770/` liefert die echte Oberfläche mit synthetischen API-Daten. Zuordnungen bestehen nur im Arbeitsspeicher und verschwinden beim Neustart. Ein separater Serverprozess pro Durchlauf startet wieder mit den gleichen Beispielen. Anleitung: [Demo](demo/README.md).

Die Repo-Screenshots unter `docs/screenshots/` zeigen die Demo im normalen Browserfenster (1265 × 712 Pixel pro Aufnahme). Sie enthalten keine Browser-Adresszeile oder echte Konfigurationsdaten. `plugin/toniehopper/preview.png` verwendet dieselbe anonyme Startseite.

## Vorschau mit der eigenen TeddyCloud

```sh
python3 tools/serve-preview.py --teddycloud http://teddycloud.local
```

Adresse durch den eigenen Host ersetzen. Die Vorschau auf `http://127.0.0.1:8766/` liest echte Figuren und Bibliotheksdateien; Schreibanfragen sind gesperrt. Optional kann `--config .local/toniehopper.json` eine eigene Vorschau-Konfiguration laden. Ohne diese Option startet die leere Vorlage.

## Tests

Unit-Tests (Node.js, keine zusätzlichen Pakete):

```sh
node --test tests/api.test.js tests/config.test.js tests/catalog.test.js tests/figures.test.js
```

Die Browser-Tests setzen Playwright und Chrome voraus:

```sh
npm install --no-save --package-lock=false playwright
node tests/browser-smoke.cjs
node tools/render-animation.test.cjs
```

Bei Bedarf den Chrome-Pfad über `CHROME_PATH` angeben. Der Browser-Smoke-Test simuliert sämtliche Anfragen lokal. Er prüft Zuordnung, geänderte Sichtbarkeit, unsichere API-Antworten, Einrichtung, Export, Suche und schmale Ansichten. Die Animation wird mit deaktiviertem WebGL geprüft. Ergebnisbilder liegen im ignorierten Ordner `tests/artifacts/`.

Für einen ausschließlich lesenden Check einer eigenen Installation:

```sh
node tools/check-installed.cjs http://teddycloud.local
```

Dieser Check kann echte Namen und Figuren aufzeichnen. Seine Ergebnisse landen deshalb ausschließlich in `.local/installed-check/`, das von Git ausgeschlossen ist.

## Animation

Die ausgelieferte Animation verwendet einen 2D-Canvas und lokale PNG-Atlanten. Die Quellen unter `tools/animation/` sind nur für die Neuberechnung nötig. Sie enthalten die Szene, die Hand und die Maske für den vorderen Daumen.

`tools/render-animation.cjs` benötigt zusätzlich Sharp und eine lokale Three.js-r160-CommonJS-Datei:

```sh
node tools/render-animation.cjs \
  --three /pfad/zu/three.cjs \
  --browser /pfad/zu/chrome
```

Details zu Auflösung, Phasen und Herkunft stehen bei den [Animations-Assets](../plugin/toniehopper/assets/animation/README.md).

## Altersempfehlungen aktualisieren

`tools/build-age-data.py` erzeugt die Zuordnung zwischen Modellnummern und Altersempfehlungen aus einem festgelegten Stand des erweiterten Tonie-Katalogs. Der Standardlauf ist auf eine konkrete Revision festgelegt:

```sh
python3 tools/build-age-data.py
```

Neue Revisionen ausdrücklich mit `--revision` und `--source-date` angeben; `--input` liest eine bereits lokal vorliegende Quelldatei. Unbekannte Angaben, ungültige Werte und widersprüchliche Editionen werden nicht als bekannte Altersempfehlung übernommen. Die Herkunft wird im erzeugten JSON dokumentiert.

## Veröffentlichung

```sh
python3 tools/build-plugin.py
```

Das Paket enthält nur den installierbaren Plugin-Ordner. Demo, Screenshots, Tests und Werkzeuge werden nicht mitinstalliert. Eine persönliche `plugin/toniehopper/config.json` oder Symlinks führen beim Paketbau zu einem Fehler. Die leere Konfigurationsvorlage bleibt unverändert; echte Daten gehören in `.local/` oder Dateien mit der Endung `.local.json`.
