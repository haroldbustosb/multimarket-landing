"""Embed MultiMakia logo icon in the center of a QR code image."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
QR_SRC = ASSETS / "qr-source.png"
ICON = ASSETS / "logo-icon.png"
OUT = ASSETS / "qr-multimakia.png"

# Quiet zone around center logo (~20% of canvas — safe for scanning)
LOGO_ZONE_RATIO = 0.21
ICON_FILL_RATIO = 0.78


def find_center_quiet_size(qr: Image.Image) -> int:
    """Estimate existing center white pad from the source QR."""
    px = qr.load()
    w, h = qr.size
    cx, cy = w // 2, h // 2
    threshold = 245

    def is_light(x: int, y: int) -> bool:
        r, g, b = px[x, y][:3]
        return r >= threshold and g >= threshold and b >= threshold

    radius = 0
    while radius < min(w, h) // 2:
        radius += 1
        for x in range(cx - radius, cx + radius + 1):
            for y in (cy - radius, cy + radius):
                if 0 <= x < w and 0 <= y < h and not is_light(x, y):
                    return max(radius * 2 - 2, int(min(w, h) * LOGO_ZONE_RATIO))
        for y in range(cy - radius, cy + radius + 1):
            for x in (cx - radius, cx + radius):
                if 0 <= x < w and 0 <= y < h and not is_light(x, y):
                    return max(radius * 2 - 2, int(min(w, h) * LOGO_ZONE_RATIO))
    return int(min(w, h) * LOGO_ZONE_RATIO)


def main() -> None:
    if not QR_SRC.exists():
        raise SystemExit(f"Missing source QR: {QR_SRC}")

    qr = Image.open(QR_SRC).convert("RGBA")
    icon = Image.open(ICON).convert("RGBA")

    w, h = qr.size
    zone = find_center_quiet_size(qr.convert("RGB"))
    cx, cy = w // 2, h // 2
    half = zone // 2

    overlay = Image.new("RGBA", qr.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(
        (cx - half, cy - half, cx + half, cy + half),
        radius=max(8, zone // 8),
        fill=(255, 255, 255, 255),
    )

    max_icon = int(zone * ICON_FILL_RATIO)
    ratio = min(max_icon / icon.width, max_icon / icon.height)
    icon_w = max(1, int(icon.width * ratio))
    icon_h = max(1, int(icon.height * ratio))
    scaled = icon.resize((icon_w, icon_h), Image.Resampling.LANCZOS)

    icon_layer = Image.new("RGBA", qr.size, (0, 0, 0, 0))
    icon_layer.paste(scaled, (cx - icon_w // 2, cy - icon_h // 2), scaled)

    result = Image.alpha_composite(qr, overlay)
    result = Image.alpha_composite(result, icon_layer)
    result.convert("RGB").save(OUT, optimize=True)
    print(f"Wrote {OUT} ({w}x{h}, zone={zone}px)")


if __name__ == "__main__":
    main()
