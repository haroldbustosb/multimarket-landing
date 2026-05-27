"""Remove near-white background from logo PNG (transparent alpha)."""
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parents[1] / "assets" / "logo-principal.png"
THRESHOLD = 235  # pixels lighter than this become transparent
SOFTNESS = 25    # smooth edge on anti-aliased borders


def luminance(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = luminance(r, g, b)
            if lum >= THRESHOLD:
                px[x, y] = (r, g, b, 0)
            elif lum >= THRESHOLD - SOFTNESS:
                # Feather edge: partial transparency
                t = (lum - (THRESHOLD - SOFTNESS)) / SOFTNESS
                alpha = int(255 * (1 - t))
                px[x, y] = (r, g, b, min(a, alpha))

    img.save(SRC, optimize=True)
    print(f"Saved transparent logo: {SRC} ({w}x{h})")


if __name__ == "__main__":
    main()
