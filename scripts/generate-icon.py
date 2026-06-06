#!/usr/bin/env python3
"""Generate Forge app icons.

Design: a macOS-style squircle in ComfyUI blue (#172DD6) holding a 3x3 grid of
ComfyUI-yellow (#EFFF3F) rounded cells — a "mini database grid". Outputs:
  build/icon.png   (1024, transparent corners)
  build/icon.icns  (macOS, multi-size via iconutil)
  build/icon.ico   (Windows, multi-size)

Run:  python3 scripts/generate-icon.py
Requires: Pillow, and macOS `iconutil` (for the .icns).
"""
import os
import math
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFilter

BLUE = (0x17, 0x2D, 0xD6)
YELLOW = (0xEF, 0xFF, 0x3F)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
os.makedirs(BUILD, exist_ok=True)

SS = 4                 # supersample factor for crisp anti-aliasing
SIZE = 1024            # final master size
S = SIZE * SS          # working canvas


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def squircle_points(cx, cy, a, n=5.0, steps=2048):
    """Parametric superellipse (Apple-style continuous-corner squircle)."""
    pts = []
    for i in range(steps):
        th = 2 * math.pi * i / steps
        ct, st = math.cos(th), math.sin(th)
        x = cx + a * math.copysign(abs(ct) ** (2.0 / n), ct)
        y = cy + a * math.copysign(abs(st) ** (2.0 / n), st)
        pts.append((x, y))
    return pts


# --- squircle geometry: body is 824/1024 of the canvas (100px padding @1024) ---
body = 824 / 1024 * S
a = body / 2
cx = cy = S / 2
pts = squircle_points(cx, cy, a, n=5.0)

mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).polygon(pts, fill=255)

# --- subtle vertical gradient fill ---
top = lerp(BLUE, (255, 255, 255), 0.12)   # slightly lighter top
bot = lerp(BLUE, (0, 0, 0), 0.10)         # slightly darker bottom
col = Image.new("RGB", (1, S))
for y in range(S):
    col.putpixel((0, y), lerp(top, bot, y / (S - 1)))
fill = col.resize((S, S)).convert("RGBA")

# --- soft contact shadow (sits in the transparent padding, macOS-style) ---
shadow_solid = Image.new("RGBA", (S, S), (8, 12, 45, 120))
shadow = Image.composite(shadow_solid, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask)
shadow_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
shadow_layer.paste(shadow, (0, int(0.008 * S)))
shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(int(0.013 * S)))

base = Image.alpha_composite(Image.new("RGBA", (S, S), (0, 0, 0, 0)), shadow_layer)

# --- squircle body ---
body_img = Image.composite(fill, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask)
base = Image.alpha_composite(base, body_img)

# --- 3x3 grid of rounded yellow cells ---
grid_extent = 0.50 * S
gx0 = cx - grid_extent / 2
gy0 = cy - grid_extent / 2
gap_ratio = 0.16
cell = grid_extent / (3 + 2 * gap_ratio)
gap = cell * gap_ratio
radius = cell * 0.24


def cell_rect(c, r):
    x = gx0 + c * (cell + gap)
    y = gy0 + r * (cell + gap)
    return [x, y, x + cell, y + cell]


# drop shadow under the cells (clipped to the squircle)
cells_shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dsh = ImageDraw.Draw(cells_shadow)
for r in range(3):
    for c in range(3):
        x0, y0, x1, y1 = cell_rect(c, r)
        dy = 0.015 * S
        dsh.rounded_rectangle([x0, y0 + dy, x1, y1 + dy], radius=radius, fill=(6, 10, 45, 130))
cells_shadow = cells_shadow.filter(ImageFilter.GaussianBlur(int(0.010 * S)))
cells_shadow = Image.composite(cells_shadow, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask)
base = Image.alpha_composite(base, cells_shadow)

# the yellow cells themselves
cells = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dc = ImageDraw.Draw(cells)
for r in range(3):
    for c in range(3):
        x0, y0, x1, y1 = cell_rect(c, r)
        dc.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=YELLOW + (255,))
base = Image.alpha_composite(base, cells)

# --- export master png ---
master = base.resize((SIZE, SIZE), Image.LANCZOS)
master.save(os.path.join(BUILD, "icon.png"))

# --- macOS .icns via iconutil ---
iconset = os.path.join(BUILD, "icon.iconset")
shutil.rmtree(iconset, ignore_errors=True)
os.makedirs(iconset)
specs = [
    (16, "icon_16x16.png"), (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"), (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"), (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"), (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"), (1024, "icon_512x512@2x.png"),
]
for px, name in specs:
    base.resize((px, px), Image.LANCZOS).save(os.path.join(iconset, name))
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(BUILD, "icon.icns")], check=True)
shutil.rmtree(iconset, ignore_errors=True)

# --- Windows .ico (multi-size) ---
ico_sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
master.save(os.path.join(BUILD, "icon.ico"), sizes=ico_sizes)

print("Done -> build/icon.png, build/icon.icns, build/icon.ico")
