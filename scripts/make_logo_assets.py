"""Export logo icon, favicons (max fill), from logo-principal.png."""
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / "assets"
LOGO = ASSETS / "logo-principal.png"


def find_icon_bounds(alpha):
    w, h = alpha.size
    px = alpha.load()
    threshold = max(8, w * 0.02)

    top = 0
    for y in range(h):
        if sum(px[x, y] for x in range(w)) > threshold:
            top = y
            break

    gap = 0
    bottom = h
    seen = False
    for y in range(top, h):
        if sum(px[x, y] for x in range(w)) > threshold:
            seen = True
            gap = 0
        elif seen:
            gap += 1
            if gap >= 10:
                bottom = y - gap
                break

    if bottom - top < h * 0.12:
        bottom = int(h * 0.42)

    left, right = w, 0
    for y in range(top, bottom):
        for x in range(w):
            if px[x, y] > 0:
                left = min(left, x)
                right = max(right, x)

    pad = max(2, int((right - left) * 0.03))
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(w, right + pad),
        min(h, bottom + pad),
    )


def save_square_icon(icon: Image.Image, size: int, path: Path) -> None:
    """Scale icon to fill the entire favicon canvas."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ratio = min(size / icon.width, size / icon.height)
    new_w = max(1, int(icon.width * ratio))
    new_h = max(1, int(icon.height * ratio))
    scaled = icon.resize((new_w, new_h), Image.Resampling.LANCZOS)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.paste(scaled, (x, y), scaled)
    canvas.save(path, optimize=True)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    img = Image.open(LOGO).convert("RGBA")
    icon = img.crop(find_icon_bounds(img.split()[3]))

    icon.save(ASSETS / "logo-icon.png", optimize=True)

    for size in (16, 32, 48, 64, 180):
        save_square_icon(icon, size, ASSETS / f"favicon-{size}.png")

    ico16 = Image.open(ASSETS / "favicon-16.png")
    ico32 = Image.open(ASSETS / "favicon-32.png")
    ico48 = Image.open(ASSETS / "favicon-48.png")
    ico64 = Image.open(ASSETS / "favicon-64.png")
    ico16.save(
        ASSETS / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
        append_images=[ico32, ico48, ico64],
    )

    print("Assets written:", ASSETS)


if __name__ == "__main__":
    main()
