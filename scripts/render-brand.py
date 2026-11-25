"""
Builds every logo file the site uses from the master artwork.

  python scripts/render-brand.py [path/to/new-logo.png]

With a path, that image (transparent PNG/WebP) becomes the new master first. Needs Pillow.

Writes:
  apps/web/src/assets/brand/logo.png          master (full logo with the league name), lossless
  apps/web/src/assets/brand/logo-960.webp     full logo for the home hero, login page
  apps/web/src/assets/brand/logo-480.webp     full logo for the footer and small spots
  apps/web/src/assets/brand/emblem.png        square crop of the hooded head (master for icons)
  apps/web/src/assets/brand/emblem-192.webp   head crop for the header and menu
  apps/web/public/favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og.png
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / 'apps/web/src/assets/brand'
PUBLIC = ROOT / 'apps/web/public'
BG = (10, 10, 11, 255)  # --color-bg

# The hooded head inside the master artwork (left, top, right, bottom), as a fraction of its size,
# so a re-exported master at another resolution still crops the same area.
HEAD = (346 / 1333, 20 / 1180, 986 / 1333, 660 / 1180)


def on_bg(img: Image.Image) -> Image.Image:
    bg = Image.new('RGBA', img.size, BG)
    bg.alpha_composite(img)
    return bg


def fit_width(img: Image.Image, width: int) -> Image.Image:
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


def main():
    master_path = BRAND / 'logo.png'
    if len(sys.argv) > 1:
        Image.open(sys.argv[1]).convert('RGBA').save(master_path, optimize=True)
    logo = Image.open(master_path).convert('RGBA')
    w, h = logo.size

    fit_width(logo, 960).save(BRAND / 'logo-960.webp', quality=90, method=6)
    fit_width(logo, 480).save(BRAND / 'logo-480.webp', quality=90, method=6)

    l, t, r, b = HEAD
    head = logo.crop((round(l * w), round(t * h), round(r * w), round(b * h)))
    side = max(head.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.alpha_composite(head, ((side - head.width) // 2, (side - head.height) // 2))
    square.save(BRAND / 'emblem.png', optimize=True)
    square.resize((192, 192), Image.LANCZOS).save(BRAND / 'emblem-192.webp', quality=92, method=6)

    # Icons: the head on the site background, edge to edge (it reads best at tiny sizes).
    icon = on_bg(square)
    for name, size in (('favicon-32.png', 32), ('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)):
        icon.resize((size, size), Image.LANCZOS).convert('RGB').save(PUBLIC / name, optimize=True)

    # Open Graph card: the full logo centred on the site background with a soft red glow.
    W, H = 1200, 630
    card = Image.new('RGBA', (W, H), BG)
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W / 2 - 330, H / 2 - 300, W / 2 + 330, H / 2 + 300), fill=(224, 30, 45, 70))
    card.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)))
    art = logo.resize((round(w * 570 / h), 570), Image.LANCZOS)
    card.alpha_composite(art, ((W - art.width) // 2, (H - art.height) // 2))
    card.convert('RGB').save(PUBLIC / 'og.png', optimize=True)

    print('brand files written')


if __name__ == '__main__':
    main()
