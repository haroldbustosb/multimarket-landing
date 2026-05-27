"""Extract icon-only favicons from the MultiMakia logo."""
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

    pad = max(4, int((right - left) * 0.06))
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(w, right + pad),
        min(h, bottom + pad),
    )


def save_square_icon(icon: Image.Image, size: int, path: Path, fill: float = 0.94) -> None:
    """Fill most of the canvas so the icon reads larger in browser tabs."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target = max(1, int(size * fill))
    scaled = icon.copy()
    scaled.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    canvas.paste(scaled, (x, y), scaled)
    canvas.save(path, optimize=True)


def main() -> None:
    img = Image.open(LOGO).convert("RGBA")
    alpha = img.split()[3]
    box = find_icon_bounds(alpha)
    icon = img.crop(box)

    save_square_icon(icon, 16, ASSETS / "favicon-16.png", fill=0.96)
    save_square_icon(icon, 32, ASSETS / "favicon-32.png", fill=0.96)
    save_square_icon(icon, 48, ASSETS / "favicon-48.png", fill=0.96)
    save_square_icon(icon, 180, ASSETS / "apple-touch-icon.png", fill=0.92)

    ico32 = Image.open(ASSETS / "favicon-32.png")
    ico48 = Image.open(ASSETS / "favicon-48.png")
    ico16 = Image.open(ASSETS / "favicon-16.png")
    ico16.save(
        ASSETS / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[ico32, ico48],
    )

    print("Favicons created in", ASSETS)


if __name__ == "__main__":
    main()
