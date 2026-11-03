"""Draws public/og.png, the link-preview image: no artwork, logos or company names. Needs Pillow; run once, and the output is committed.

Usage (from web/): python scripts/make_share_image.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
PAPER, INK, MUTED, LINE = "#f6f5f2", "#16181d", "#5f636c", "#e4e1da"
FONTS = Path("/System/Library/Fonts/Supplemental")


def font(name: str, size: int):
    return ImageFont.truetype(str(FONTS / name), size)


img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)
d.rectangle((72, 84, 84, 546), fill=INK)
d.text((120, 72), "FINN", font=font("Arial Bold.ttf", 132), fill=INK)
d.text((124, 232), "Your portfolio's filings, ranked.", font=font("Arial.ttf", 54), fill=INK)
d.text((124, 306), "Every figure tied to the page it came from.", font=font("Arial.ttf", 40), fill=MUTED)

# A stepped line with no figures: a target followed from call to call, as the app draws it.
points = [(124, 420), (420, 420), (420, 470), (716, 470), (716, 510), (1076, 510)]
d.line(points, fill=INK, width=6, joint="curve")
for x, y in [(124, 420), (420, 470)]:
    d.ellipse((x - 11, y - 11, x + 11, y + 11), fill=PAPER, outline=INK, width=5)
d.ellipse((716 - 13, 510 - 13, 716 + 13, 510 + 13), fill=INK)
d.line((124, 556, 1076, 556), fill=LINE, width=2)
d.text((124, 568), "A recorded demo. Nothing here is live, and nothing here is advice.", font=font("Arial.ttf", 28), fill=MUTED)

img.save(Path(__file__).parent.parent / "public" / "og.png", optimize=True)
