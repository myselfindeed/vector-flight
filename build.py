"""Build the standalone, offline-capable game using only the Python standard library."""
from base64 import b64encode
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
SRC, VENDOR = ROOT / "src", ROOT / "vendor"


def font_url(name):
    data = (VENDOR / f"BarlowCondensed-{name}.woff").read_bytes()
    return "data:font/woff;base64," + b64encode(data).decode("ascii")


def script(text):
    return re.sub(r"</script", r"<\\/script", text, flags=re.IGNORECASE)


page = (SRC / "shell.html").read_text()
css = (SRC / "ui.css").read_text()
css = css.replace("@FONT_REGULAR@", font_url("SemiBold")).replace("@FONT_ITALIC@", font_url("SemiBoldItalic"))
program = "\n".join((SRC / name).read_text() for name in (
    "instruments.js", "pfd.js", "cockpit.js", "visor.js", "aircraft.js", "deck-fleet.js", "carrier.js",
    "ocean.js", "woodland.js", "terrain-material.js", "coast.js", "exhaust.js", "wing-trails.js", "ground-light.js", "audio.js", "tower.js",
    "radio-panel.js", "simulator.js", "effects.js", "range.js", "duel-flares.js", "duel.js", "radar.js", "observer.js", "flight.js",
))
radio_audio = (VENDOR / "tower-radio.mp3").read_bytes()
radio_cues = json.loads((VENDOR / "tower-radio.json").read_text())
program = program.replace("@TOWER_RADIO_AUDIO@", "data:audio/mpeg;base64," + b64encode(radio_audio).decode("ascii"))
program = program.replace("@TOWER_RADIO_CUES@", json.dumps(radio_cues, separators=(",", ":")))
license_names = ["three.LICENSE", "BarlowCondensed.OFL", "sky.LICENSE", "terrain.LICENSE"]
for token, filename in {
    "@SKY_PANORAMA@": "coast-sky.webp",
    "@GROUND_GRASS@": "grass-ground.webp",
    "@GROUND_MEADOW@": "rocky-meadow.webp",
    "@GROUND_ROCK@": "rock-face.webp",
    "@GROUND_SOIL@": "brown-soil.webp",
    "@TREE_FOLIAGE@": "silver-birch.webp",
}.items():
    photo = (VENDOR / filename).read_bytes()
    program = program.replace(token, "data:image/webp;base64," + b64encode(photo).decode("ascii"))
licenses = "\n\n".join((VENDOR / name).read_text() for name in license_names)
page = page.replace("/* @STYLE@ */", css).replace("<!-- @LICENSES@ -->", "<!--\n" + licenses.replace("-->", "-- >") + "\n-->")
page = page.replace("/* @THREE@ */", script((VENDOR / "three.min.js").read_text()))
page = page.replace("/* @PROGRAM@ */", script(program))
output = ROOT / "dist" / "index.html"
output.parent.mkdir(exist_ok=True)
data = page.encode("utf-8")
if len(data) >= 10_000_000:
    raise ValueError(f"The standalone game must be under 10 MB, got {len(data):,} bytes.")
temporary = output.with_suffix(".tmp")
temporary.write_bytes(data)
temporary.replace(output)
print(f"{output.name} · {len(data):,} bytes")
