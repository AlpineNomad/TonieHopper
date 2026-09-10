# Lokale Demo

Die Demo verwendet das echte Plugin mit einer vollständig lokalen TeddyCloud-Simulation. **Mia, Ben, Figurenkennungen, Dateinamen und Zuordnungen sind erfunden.** Sie enthält keine privaten Konfigurationsdaten, echten Gerätekennungen oder Audiodateien. Die sichtbare Demo-Kennzeichnung gehört nur zu diesem lokalen Server.

Vom Projektordner starten (Python 3.9 oder neuer, keine Zusatzpakete):

```sh
python3 tools/serve-demo.py
```

Danach [die lokale Demo](http://127.0.0.1:8770/) öffnen. Mit `--port 8771` kann ein anderer Port gewählt werden. Der Server bindet ausschließlich an `127.0.0.1`. Er stellt keine Verbindung zu TeddyCloud oder anderen Servern her; eine lokale Content-Security-Policy beschränkt die Browseranfragen auf dieselbe Herkunft.

Über die normale Oberfläche lassen sich Kinderauswahl, Tonie-Bibliothek mit Altersfilter, eigene Hörwelt, Zuordnungsbestätigung und die Box-Anleitung ausprobieren. Eine bestätigte Zuordnung wird ausschließlich im Arbeitsspeicher simuliert. Ein Serverneustart setzt die Demo zurück. Die Box-Anleitung ist die bestehende schrittweise Animation; die Demo simuliert keinen automatisch erkannten Box-Refresh.

Für reproduzierbare Screenshots den Server neu starten, einen Browser ohne Zoom verwenden und denselben Browser-Viewport verwenden. Die beiliegenden Aufnahmen verwenden 1265 × 712 Pixel. Für die Bibliothek „Mia“ auswählen und „Alter bis“ auf „4 Jahre“ stellen. Mit „3 Jahre“ verschwindet das NEINhorn mit der Empfehlung ab 4 Jahren. „Waldabenteuer“ in der eigenen Hörwelt ist eine erfundene Beispielgeschichte ohne Altersangabe.

Die ausgewählten Produktnamen, Modellnummern und Alterswerte sind öffentliche Produktinformationen; die Bilder zeigen reale Tonie-Produkte. Sie dienen ausschließlich zur Veranschaulichung der Plugin-Oberfläche. Bildrechte und Markenrechte verbleiben bei den jeweiligen Rechteinhabern; die Bilder sind keine frei lizenzierten Projektgrafiken. EXIF-, Text- und Zeitmetadaten wurden aus den PNGs entfernt, ihre Bilddaten sind unverändert.
