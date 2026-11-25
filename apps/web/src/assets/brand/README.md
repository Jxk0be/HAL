Blackhat Invitational League logo: a hooded figure with glowing red eyes over the BLACKHAT /
INVITATIONAL LEAGUE banner, with red splatter behind (supplied artwork, transparent PNG).

- `logo.png` is the master (full logo, lossless). Everything else is generated from it.
- `logo-960.webp` / `logo-480.webp`: the full logo for the site (`BrandLogo variant="full"`).
- `emblem.png` / `emblem-192.webp`: a square crop of the hooded head, for the header lockup and icons.
- `apps/web/public` icons (favicon, apple-touch, 192, 512) and `og.png` come from the same master.

To change the logo, run `python scripts/render-brand.py path/to/new-logo.png` (needs Pillow). It
replaces the master and rebuilds every file above. The head crop is set by `HEAD` in that script.

For Discord (server icon, bot avatar) use `emblem.png`; for banners and socials use `logo.png`.
In the UI use the `accent` / `brand` tokens from `main.css`, not hex values from the artwork.
