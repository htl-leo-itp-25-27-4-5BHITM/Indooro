"""Generate original generic grocery package fronts used by the Blender store kit.

Requires rsvg-convert. The committed PNGs let normal rendering run without it.
No third-party product marks or imagery are used.
"""
from pathlib import Path
import subprocess
from html import escape

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "product-labels"
OUT.mkdir(parents=True, exist_ok=True)

PRODUCTS = [
    ("MILCH", "FRISCH & MILD", "#e9e8da", "#207c72", "#bfdad2"),
    ("HAFER", "NATURKORN", "#ead6b7", "#775438", "#d2ae71"),
    ("PASTA", "DURUM WEIZEN", "#e6c68a", "#a34833", "#d39750"),
    ("SAFT", "APFEL · 100 %", "#cfddd0", "#466d43", "#9bb682"),
    ("REIS", "LANGKORN", "#e5dfd0", "#595e67", "#b4b8af"),
    ("KAFFEE", "GANZE BOHNE", "#b89b80", "#41362e", "#8d674b"),
    ("TEE", "KRÄUTER", "#ced9bd", "#4c6e55", "#99ad7a"),
    ("KAKAO", "FEIN HERB", "#c3a894", "#593d38", "#946457"),
]

for name, subtitle, paper, ink, accent in PRODUCTS:
    subtitle = escape(subtitle)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="384" height="512" viewBox="0 0 384 512">
      <rect width="384" height="512" fill="{paper}"/>
      <path d="M0 0h384v34H0zM0 478h384v34H0z" fill="{ink}"/>
      <path d="M44 74h296v5H44z" fill="{ink}" opacity=".45"/>
      <circle cx="192" cy="239" r="102" fill="{accent}" opacity=".55"/>
      <circle cx="192" cy="239" r="68" fill="none" stroke="{ink}" stroke-width="5" opacity=".65"/>
      <path d="M108 238h168M192 154v168" stroke="{ink}" stroke-width="3" opacity=".3"/>
      <text x="192" y="116" text-anchor="middle" fill="{ink}" font-family="DejaVu Sans,Arial,sans-serif" font-size="18" letter-spacing="5">NORD &amp; NAH</text>
      <text x="192" y="389" text-anchor="middle" fill="{ink}" font-family="DejaVu Sans,Arial,sans-serif" font-weight="700" font-size="45" letter-spacing="2">{name}</text>
      <text x="192" y="427" text-anchor="middle" fill="{ink}" font-family="DejaVu Sans,Arial,sans-serif" font-size="17" letter-spacing="3">{subtitle}</text>
      <text x="192" y="456" text-anchor="middle" fill="{ink}" font-family="DejaVu Sans,Arial,sans-serif" font-size="11" letter-spacing="2">QUALITÄT FÜR JEDEN TAG</text>
    </svg>'''
    subprocess.run(["rsvg-convert", "-w", "384", "-h", "512", "-o", str(OUT / f"{name.lower()}.png")],
                   input=svg.encode(), check=True)
print(f"Generated {len(PRODUCTS)} original package labels in {OUT}")
