"""Build the bundled map artwork for the Map pool page.

Usage: python scripts/render-maps.py <folder of screenshots>

Each image becomes apps/web/src/assets/maps/<slug>.webp (1280px wide, plus a 640px -sm copy),
where <slug> is the map name before any "-2"/"-U92"-style suffix, lowercased ("Reactor-U92-2.jpg"
-> reactor). The site matches a map to its art by the same slug of the map's name (lib/mapArt.ts).
An admin-uploaded maps.image_url always wins over the bundled art.
"""
import re
import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "assets" / "maps"
SIZES = {"": 1280, "-sm": 640}


def slug(stem: str) -> str:
    # "Reactor-U92-2" -> "reactor", "Coal-2" -> "coal", "rooftops" -> "rooftops"
    return re.split(r"[-_ ]", stem, maxsplit=1)[0].lower()


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for path in sorted(src.iterdir()):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        name = slug(path.stem)
        with Image.open(path) as im:
            im = im.convert("RGB")
            for suffix, width in SIZES.items():
                h = round(im.height * width / im.width)
                out = OUT / f"{name}{suffix}.webp"
                im.resize((width, h), Image.LANCZOS).save(out, "WEBP", quality=78, method=6)
                print(f"{path.name} -> {out.relative_to(OUT.parent.parent.parent.parent.parent)} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
