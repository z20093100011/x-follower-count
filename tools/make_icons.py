"""Generate extension icons with Pillow; run from any working directory."""
from pathlib import Path
from PIL import Image, ImageDraw


def make_icon(size):
    scale = size * 4
    image = Image.new("RGBA", (scale, scale))
    draw = ImageDraw.Draw(image)

    def box(*coords):
        return tuple(round(value * scale) for value in coords)

    draw.rounded_rectangle((0, 0, scale - 1, scale - 1),
                           radius=round(scale * 0.22), fill="#1d9bf0")
    center = 0.5 if size == 16 else 0.36
    draw.ellipse(box(center - 0.115, 0.22, center + 0.115, 0.45), fill="white")
    draw.arc(box(center - 0.21, 0.51, center + 0.21, 0.91),
             180, 360, fill="white", width=round(scale * 0.075))
    if size > 16:
        for index, height in enumerate((0.15, 0.25, 0.36)):
            left = 0.63 + index * 0.085
            draw.rounded_rectangle(box(left, 0.72 - height, left + 0.055, 0.72),
                                   radius=round(scale * 0.015), fill="white")
    return image.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    target = Path(__file__).resolve().parents[1] / "icons"
    target.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        make_icon(size).save(target / f"icon{size}.png")
