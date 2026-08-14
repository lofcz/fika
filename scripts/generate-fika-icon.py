"""Generate the fika product mark (ink-theme SVG favicon)."""

from __future__ import annotations

import math
from pathlib import Path

INK = "#18181b"
VIEW = 64
OUT = Path(__file__).resolve().parents[1] / "public" / "favicon.svg"


def superellipse(cx: float, cy: float, rx: float, ry: float, n: float = 4.8, steps: int = 128) -> str:
    pts: list[tuple[float, float]] = []
    for i in range(steps):
        t = (i / steps) * 2 * math.pi
        cost, sint = math.cos(t), math.sin(t)
        x = cx + rx * math.copysign(abs(cost) ** (2 / n), cost)
        y = cy + ry * math.copysign(abs(sint) ** (2 / n), sint)
        pts.append((x, y))
    d = [f"M {pts[0][0]:.3f} {pts[0][1]:.3f}"]
    d.extend(f"L {x:.3f} {y:.3f}" for x, y in pts[1:])
    d.append("Z")
    return " ".join(d)


def rounded_rect(x: float, y: float, w: float, h: float, r: float) -> str:
    r = min(r, w / 2, h / 2)
    return (
        f"M {x + r:.3f} {y:.3f} "
        f"H {x + w - r:.3f} "
        f"A {r:.3f} {r:.3f} 0 0 1 {x + w:.3f} {y + r:.3f} "
        f"V {y + h - r:.3f} "
        f"A {r:.3f} {r:.3f} 0 0 1 {x + w - r:.3f} {y + h:.3f} "
        f"H {x + r:.3f} "
        f"A {r:.3f} {r:.3f} 0 0 1 {x:.3f} {y + h - r:.3f} "
        f"V {y + r:.3f} "
        f"A {r:.3f} {r:.3f} 0 0 1 {x + r:.3f} {y:.3f} "
        f"Z"
    )


def build_svg() -> str:
    tile = superellipse(32, 32, 32, 32)
    cup = rounded_rect(14.5, 17.5, 24.5, 28.5, 7.2)
    coffee = (
        f"M 19.6 23.6 "
        f"A 9.6 3.05 0 1 0 34.0 23.6 "
        f"A 9.6 3.05 0 1 0 19.6 23.6 "
        f"Z"
    )
    handle = (
        f"M 38.4 25.5 "
        f"A 7.7 7.7 0 0 1 38.4 40.9"
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW} {VIEW}" width="32" height="32" fill="none" role="img" aria-label="fika">
  <title>fika</title>
  <path fill="{INK}" d="{tile}"/>
  <path fill="#fff" d="{cup}"/>
  <path fill="{INK}" d="{coffee}"/>
  <path d="{handle}" fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round"/>
</svg>
"""


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build_svg(), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
