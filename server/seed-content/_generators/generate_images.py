#!/usr/bin/env python3
"""Generate all procedural 2D assets (backgrounds, SVG decorations, panorama)."""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SEED_ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = SEED_ROOT / "images"

BG_W, BG_H = 1920, 1080


# ---------------------------------------------------------------------------
# Backgrounds
# ---------------------------------------------------------------------------


def _interp_stops(t: np.ndarray, stops) -> np.ndarray:
    positions = np.array([s[0] for s in stops], dtype=np.float32)
    colors = np.array([s[1] for s in stops], dtype=np.float32)
    out = np.empty(t.shape + (3,), dtype=np.float32)
    for channel in range(3):
        out[..., channel] = np.interp(t, positions, colors[:, channel])
    return out


def _base_gradient(w: int, h: int, stops, diagonal: bool = True):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    if diagonal:
        t = 0.58 * (yy / (h - 1)) + 0.42 * (xx / (w - 1))
    else:
        t = yy / (h - 1)
    arr = _interp_stops(t, stops)
    return arr, xx, yy


def _add_glow(arr, xx, yy, cx, cy, radius, color, strength):
    mask = np.exp(-(((xx - cx) ** 2) + ((yy - cy) ** 2)) / (2.0 * radius * radius))
    arr += mask[..., None] * np.array(color, dtype=np.float32) * strength


def _finish(arr, xx, yy, w, h):
    dist = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    vig = np.clip(1.03 - 0.17 * dist**2, 0.65, 1.0)
    arr *= vig[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def _glow_layer(size, draw_fn, blur=36):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def _particles(draw, rng, w, h, count=150, color=(120, 220, 255)):
    for _ in range(count):
        x = rng.uniform(0, w)
        y = rng.uniform(0, h * 0.82)
        radius = rng.uniform(0.4, 1.7)
        alpha = int(rng.uniform(30, 165))
        draw.ellipse(
            [x - radius, y - radius, x + radius, y + radius],
            fill=(*color, alpha),
        )
        if rng.random() < 0.08:
            draw.ellipse(
                [x - 3.2, y - 3.2, x + 3.2, y + 3.2],
                fill=(*color, 25),
            )


def _corner_marks(draw, w, h, color=(90, 205, 255, 85), length=88):
    for x, y, sx, sy in (
        (34, 34, 1, 1),
        (w - 34, 34, -1, 1),
        (34, h - 34, 1, -1),
        (w - 34, h - 34, -1, -1),
    ):
        draw.line([(x, y), (x + sx * length, y)], fill=color, width=2)
        draw.line([(x, y), (x, y + sy * length)], fill=color, width=2)
        draw.line(
            [(x + sx * 12, y + sy * 12), (x + sx * 34, y + sy * 12)],
            fill=(*color[:3], 45),
            width=1,
        )


def background_grid(path: Path):
    stops = [
        (0.0, (2, 8, 20)),
        (0.38, (6, 24, 48)),
        (0.72, (5, 17, 38)),
        (1.0, (2, 7, 18)),
    ]
    arr, xx, yy = _base_gradient(BG_W, BG_H, stops)
    _add_glow(arr, xx, yy, 1450, 250, 560, (0, 96, 175), 0.62)
    _add_glow(arr, xx, yy, 300, 900, 540, (52, 30, 120), 0.38)
    _add_glow(arr, xx, yy, 960, 700, 460, (0, 78, 130), 0.25)
    img = _finish(arr, xx, yy, BG_W, BG_H)
    draw = ImageDraw.Draw(img, "RGBA")
    rng = random.Random(101)

    horizon = int(BG_H * 0.62)
    for x in range(0, BG_W + 1, 64):
        draw.line([(x, 0), (x, BG_H)], fill=(85, 160, 235, 22), width=1)
    for y in range(0, BG_H + 1, 64):
        draw.line([(0, y), (BG_W, y)], fill=(85, 160, 235, 22), width=1)

    # Perspective floor.
    vx, vy = BG_W / 2, horizon - 40
    for bottom_x in range(-600, BG_W + 601, 120):
        draw.line([(vx, vy), (bottom_x, BG_H)], fill=(60, 190, 255, 30), width=1)
    for i in range(1, 18):
        y = horizon + (BG_H - horizon) * (i / 17.0) ** 2.05
        draw.line([(0, y), (BG_W, y)], fill=(60, 190, 255, 30), width=1)

    # Subtle circuit traces.
    for _ in range(11):
        x = rng.uniform(80, BG_W - 160)
        y = rng.uniform(80, horizon - 80)
        points = [(x, y)]
        for _ in range(rng.randint(3, 6)):
            if rng.random() < 0.5:
                x += rng.choice([-1, 1]) * rng.uniform(40, 150)
            else:
                y += rng.choice([-1, 1]) * rng.uniform(22, 70)
            points.append((x, y))
        draw.line(points, fill=(70, 200, 255, 55), width=1)
        for px, py in points:
            draw.rectangle([px - 1.5, py - 1.5, px + 1.5, py + 1.5], fill=(120, 230, 255, 130))

    _corner_marks(draw, BG_W, BG_H)
    _particles(draw, rng, BG_W, BG_H, count=170)

    glow = _glow_layer(
        (BG_W, BG_H),
        lambda gd: (
            gd.ellipse([620, horizon - 8, 1300, horizon + 10], fill=(0, 195, 255, 120)),
            gd.ellipse([1240, 110, 1660, 340], fill=(0, 130, 220, 65)),
            gd.ellipse([260, 760, 520, 940], fill=(120, 70, 255, 50)),
        ),
        blur=48,
    )
    img = Image.alpha_composite(img.convert("RGBA"), glow)
    img.convert("RGB").save(path, quality=91, optimize=True, progressive=True)


def background_aurora(path: Path):
    stops = [
        (0.0, (3, 9, 23)),
        (0.32, (8, 21, 44)),
        (0.62, (12, 20, 50)),
        (0.85, (7, 26, 45)),
        (1.0, (2, 9, 22)),
    ]
    arr, xx, yy = _base_gradient(BG_W, BG_H, stops, diagonal=False)
    _add_glow(arr, xx, yy, 1480, 760, 640, (0, 110, 120), 0.52)
    _add_glow(arr, xx, yy, 330, 260, 560, (78, 36, 150), 0.5)
    _add_glow(arr, xx, yy, 980, 980, 530, (20, 58, 150), 0.32)
    img = _finish(arr, xx, yy, BG_W, BG_H)
    draw = ImageDraw.Draw(img, "RGBA")
    rng = random.Random(202)

    # Aurora arcs.
    cx, cy = BG_W / 2, 1500
    for i, radius in enumerate(range(540, 1340, 58)):
        color = (40 + i * 5, 195 - i * 3, 205 - i * 4, max(28, 80 - i * 4))
        draw.arc(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            start=196,
            end=344,
            fill=color,
            width=2 if i % 2 == 0 else 1,
        )

    # Light curtains.
    for x in (250, 760, 1260, 1650):
        draw.polygon(
            [(x, 0), (x + 130, 0), (x + 420, BG_H), (x + 250, BG_H)],
            fill=(60, 210, 220, 16),
        )

    # Dotted data field.
    for gy in range(60, 760, 52):
        for gx in range(50, BG_W, 52):
            if (gx // 52 + gy // 52) % 3 == 0:
                draw.ellipse([gx - 1, gy - 1, gx + 1, gy + 1], fill=(90, 210, 230, 48))

    _corner_marks(draw, BG_W, BG_H, color=(110, 235, 225, 80))
    _particles(draw, rng, BG_W, BG_H, count=190, color=(160, 240, 245))
    glow = _glow_layer(
        (BG_W, BG_H),
        lambda gd: (
            gd.ellipse([1130, 640, 1820, 1060], fill=(0, 190, 180, 90)),
            gd.ellipse([120, 80, 600, 460], fill=(110, 60, 220, 80)),
            gd.ellipse([820, 360, 1120, 520], fill=(60, 200, 230, 40)),
        ),
        blur=58,
    )
    img = Image.alpha_composite(img.convert("RGBA"), glow)
    img.convert("RGB").save(path, quality=91, optimize=True, progressive=True)


def background_wave(path: Path):
    stops = [
        (0.0, (2, 9, 22)),
        (0.35, (4, 25, 49)),
        (0.62, (4, 35, 48)),
        (0.84, (3, 20, 33)),
        (1.0, (2, 8, 18)),
    ]
    arr, xx, yy = _base_gradient(BG_W, BG_H, stops)
    _add_glow(arr, xx, yy, 1560, 420, 620, (0, 115, 155), 0.5)
    _add_glow(arr, xx, yy, 380, 240, 500, (30, 60, 160), 0.4)
    img = _finish(arr, xx, yy, BG_W, BG_H)
    draw = ImageDraw.Draw(img, "RGBA")
    rng = random.Random(303)

    horizon = 700
    vx, vy = BG_W / 2, horizon - 70
    for x in range(0, BG_W + 1, 80):
        draw.line([(x, 0), (x, BG_H)], fill=(60, 165, 215, 18), width=1)
    for bottom_x in range(-700, BG_W + 701, 150):
        draw.line([(vx, vy), (bottom_x, BG_H)], fill=(50, 180, 220, 30), width=1)
    for i in range(1, 16):
        y = horizon + (BG_H - horizon) * (i / 15) ** 2.1
        draw.line([(0, y), (BG_W, y)], fill=(50, 180, 220, 28), width=1)

    waves = []
    for k in range(10):
        base_y = 760 + k * 26
        amp = 26 + k * 4
        freq = 2 * math.pi * (1.0 + k * 0.23) / BG_W
        phase = k * 0.9 + rng.uniform(0, 0.7)
        points = []
        for x in range(0, BG_W + 12, 6):
            y = base_y + amp * math.sin(freq * x + phase) + 0.018 * (x - BG_W / 2)
            points.append((x, y))
        alpha = 85 + k * 8
        color = (50 + k * 3, 205 - k * 4, 235 - k * 2, min(alpha, 200))
        draw.line(points, fill=color, width=1 if k < 6 else 2, joint="curve")
        waves.append((points, color))

    for x in range(0, BG_W, 96):
        draw.line([(x, 0), (x, BG_H)], fill=(80, 190, 230, 8), width=1)

    # Sparks riding the waves.
    for _ in range(65):
        x = rng.uniform(120, BG_W - 120)
        y = rng.uniform(690, BG_H - 100)
        radius = rng.uniform(0.6, 1.8)
        draw.ellipse(
            [x - radius, y - radius, x + radius, y + radius],
            fill=(120, 240, 255, rng.randint(50, 160)),
        )
    _particles(draw, rng, BG_W, BG_H, count=105, color=(100, 205, 255))
    _corner_marks(draw, BG_W, BG_H, color=(70, 220, 235, 80))

    def draw_glow(gd):
        for points, color in waves[:4]:
            gd.line(points, fill=(color[0], color[1], color[2], 90), width=4, joint="curve")
        gd.ellipse([1360, 260, 1770, 540], fill=(0, 150, 190, 70))

    glow = _glow_layer((BG_W, BG_H), draw_glow, blur=26)
    img = Image.alpha_composite(img.convert("RGBA"), glow)
    img.convert("RGB").save(path, quality=91, optimize=True, progressive=True)


# ---------------------------------------------------------------------------
# SVG decorations and icons
# ---------------------------------------------------------------------------


def write_title_decor():
    left = """<svg xmlns="http://www.w3.org/2000/svg" width="800" height="88" viewBox="0 0 800 88" fill="none">
  <title>标题栏左侧装饰</title>
  <desc>启明数据可视化平台预置标题装饰，程序生成。</desc>
  <defs>
    <linearGradient id="tdl-line" x1="20" y1="44" x2="780" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0B5E9C" stop-opacity="0"/>
      <stop offset="0.52" stop-color="#36BEEF" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#A6F8FF"/>
    </linearGradient>
    <linearGradient id="tdl-fade" x1="0" y1="24" x2="0" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#36C9F5" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#36C9F5" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#36C9F5" stop-opacity="0"/>
    </linearGradient>
    <filter id="tdl-glow" x="-20%" y="-100%" width="140%" height="300%">
      <feGaussianBlur stdDeviation="5"/>
    </filter>
  </defs>
  <g filter="url(#tdl-glow)" opacity="0.55">
    <path d="M20 44H620" stroke="url(#tdl-line)" stroke-width="5"/>
  </g>
  <path d="M8 44H624" stroke="url(#tdl-line)" stroke-width="1.5"/>
  <path d="M352 67H574" stroke="url(#tdl-fade)" stroke-width="1"/>
  <path d="M430 21H584" stroke="url(#tdl-fade)" stroke-width="1"/>
  <path d="M524 26H650L708 44L650 62H524" stroke="url(#tdl-line)" stroke-width="1.5"/>
  <path d="M566 35H646L678 44L646 53H566" stroke="#58D8FF" stroke-opacity="0.55"/>
  <path d="M708 44L746 21V67L708 44Z" fill="#0B2A43" stroke="#83EEFF" stroke-width="1.2"/>
  <path d="M746 44L760 34V54L746 44Z" fill="#5FE3FF" fill-opacity="0.75"/>
  <circle cx="774" cy="44" r="3.5" fill="#B8FBFF"/>
  <circle cx="774" cy="44" r="8" stroke="#5FE3FF" stroke-opacity="0.35"/>
  <path d="M96 30H152M96 58H152" stroke="#3BA9D8" stroke-opacity="0.35"/>
  <path d="M112 30V58M136 30V58" stroke="#3BA9D8" stroke-opacity="0.2"/>
</svg>
"""
    right = """<svg xmlns="http://www.w3.org/2000/svg" width="800" height="88" viewBox="0 0 800 88" fill="none">
  <title>标题栏右侧装饰</title>
  <desc>与左侧装饰镜像对称的标题栏装饰，程序生成。</desc>
  <defs>
    <linearGradient id="tdr-line" x1="20" y1="44" x2="780" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0B5E9C" stop-opacity="0"/>
      <stop offset="0.52" stop-color="#36BEEF" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#A6F8FF"/>
    </linearGradient>
    <linearGradient id="tdr-fade" x1="0" y1="24" x2="0" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#36C9F5" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#36C9F5" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#36C9F5" stop-opacity="0"/>
    </linearGradient>
    <filter id="tdr-glow" x="-20%" y="-100%" width="140%" height="300%">
      <feGaussianBlur stdDeviation="5"/>
    </filter>
  </defs>
  <g transform="translate(800 0) scale(-1 1)">
    <g filter="url(#tdr-glow)" opacity="0.55">
      <path d="M20 44H620" stroke="url(#tdr-line)" stroke-width="5"/>
    </g>
    <path d="M8 44H624" stroke="url(#tdr-line)" stroke-width="1.5"/>
    <path d="M352 67H574" stroke="url(#tdr-fade)" stroke-width="1"/>
    <path d="M430 21H584" stroke="url(#tdr-fade)" stroke-width="1"/>
    <path d="M524 26H650L708 44L650 62H524" stroke="url(#tdr-line)" stroke-width="1.5"/>
    <path d="M566 35H646L678 44L646 53H566" stroke="#58D8FF" stroke-opacity="0.55"/>
    <path d="M708 44L746 21V67L708 44Z" fill="#0B2A43" stroke="#83EEFF" stroke-width="1.2"/>
    <path d="M746 44L760 34V54L746 44Z" fill="#5FE3FF" fill-opacity="0.75"/>
    <circle cx="774" cy="44" r="3.5" fill="#B8FBFF"/>
    <circle cx="774" cy="44" r="8" stroke="#5FE3FF" stroke-opacity="0.35"/>
    <path d="M96 30H152M96 58H152" stroke="#3BA9D8" stroke-opacity="0.35"/>
    <path d="M112 30V58M136 30V58" stroke="#3BA9D8" stroke-opacity="0.2"/>
  </g>
</svg>
"""
    (IMAGE_DIR / "title-decor-left.svg").write_text(left, encoding="utf-8")
    (IMAGE_DIR / "title-decor-right.svg").write_text(right, encoding="utf-8")


def write_title_borders():
    corners = """<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" fill="none">
  <title>大屏四角边框</title>
  <desc>透明背景的大屏四角科技边框，程序生成，可随容器缩放。</desc>
  <defs>
    <linearGradient id="bc-grad" x1="0" y1="0" x2="240" y2="240" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#9CF6FF"/>
      <stop offset="0.45" stop-color="#31C7F2"/>
      <stop offset="1" stop-color="#1165A8" stop-opacity="0.25"/>
    </linearGradient>
    <linearGradient id="bc-soft" x1="0" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#43D7FF" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#43D7FF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g id="corner" stroke-linecap="square" vector-effect="non-scaling-stroke">
    <path d="M40 160V64Q40 40 64 40H236" stroke="url(#bc-grad)" stroke-width="2.5"/>
    <path d="M62 178V84Q62 62 84 62H236" stroke="#4CD6FF" stroke-opacity="0.32" stroke-width="1"/>
    <path d="M236 40H300" stroke="#7FEBFF" stroke-opacity="0.65" stroke-width="1.5"/>
    <path d="M40 224V300" stroke="#7FEBFF" stroke-opacity="0.65" stroke-width="1.5"/>
    <path d="M40 40L94 94" stroke="#49CFF7" stroke-opacity="0.38"/>
    <rect x="36" y="36" width="8" height="8" fill="#A6F8FF"/>
    <rect x="196" y="36" width="22" height="3" fill="#5FE3FF" fill-opacity="0.7"/>
    <rect x="36" y="196" width="3" height="22" fill="#5FE3FF" fill-opacity="0.7"/>
    <circle cx="300" cy="40" r="2.5" fill="#A6F8FF"/>
    <circle cx="40" cy="300" r="2.5" fill="#A6F8FF"/>
  </g>
  <use href="#corner" transform="translate(1920 0) scale(-1 1)"/>
  <use href="#corner" transform="translate(0 1080) scale(1 -1)"/>
  <use href="#corner" transform="translate(1920 1080) scale(-1 -1)"/>
  <path d="M760 40H1160" stroke="url(#bc-grad)" stroke-width="1.2" stroke-opacity="0.75"/>
  <path d="M860 40L900 28L940 40L980 28L1020 40L1060 28L1100 40" stroke="#54DBFF" stroke-opacity="0.3"/>
  <path d="M760 1040H1160" stroke="url(#bc-grad)" stroke-width="1.2" stroke-opacity="0.45"/>
  <path d="M40 520V560M1880 520V560" stroke="#54DBFF" stroke-opacity="0.4"/>
</svg>
"""
    panel = """<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" fill="none">
  <title>面板科技边框</title>
  <desc>透明背景的面板边框，适合作为图表或信息卡片的外框，程序生成。</desc>
  <defs>
    <linearGradient id="bp-line" x1="40" y1="0" x2="760" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1A6E9E" stop-opacity="0.15"/>
      <stop offset="0.25" stop-color="#3CD0F5" stop-opacity="0.8"/>
      <stop offset="0.5" stop-color="#9CF6FF" stop-opacity="0.5"/>
      <stop offset="0.75" stop-color="#3CD0F5" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#1A6E9E" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="bp-corner" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#A6F8FF"/>
      <stop offset="0.6" stop-color="#2EB9E8"/>
      <stop offset="1" stop-color="#0D4E7A" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <g stroke-linecap="square" vector-effect="non-scaling-stroke">
    <path d="M24 92V44L68 1H184" stroke="url(#bp-corner)" stroke-width="2"/>
    <path d="M42 106V60L82 20H184" stroke="#3DCCF5" stroke-opacity="0.26"/>
    <path d="M776 92V44L732 1H616" stroke="url(#bp-corner)" stroke-width="2"/>
    <path d="M758 106V60L718 20H616" stroke="#3DCCF5" stroke-opacity="0.26"/>
    <path d="M24 508V556L68 599H184" stroke="url(#bp-corner)" stroke-width="2"/>
    <path d="M776 508V556L732 599H616" stroke="url(#bp-corner)" stroke-width="2"/>
    <path d="M164 1H636" stroke="url(#bp-line)" stroke-width="1.5"/>
    <path d="M120 599H680" stroke="url(#bp-line)" stroke-width="1" stroke-opacity="0.45"/>
    <path d="M1 144V456M799 144V456" stroke="#2EB9E8" stroke-opacity="0.2"/>
    <rect x="20" y="88" width="8" height="8" fill="#93F5FF"/>
    <rect x="772" y="88" width="8" height="8" fill="#93F5FF"/>
    <rect x="20" y="504" width="8" height="8" fill="#4FDBFF" fill-opacity="0.75"/>
    <rect x="772" y="504" width="8" height="8" fill="#4FDBFF" fill-opacity="0.75"/>
    <path d="M340 1H460" stroke="#A6F8FF" stroke-width="2"/>
    <path d="M392 0V8M408 0V8" stroke="#A6F8FF" stroke-opacity="0.6"/>
    <circle cx="400" cy="599" r="2.5" fill="#4FDBFF"/>
  </g>
</svg>
"""
    (IMAGE_DIR / "border-corners.svg").write_text(corners, encoding="utf-8")
    (IMAGE_DIR / "border-panel.svg").write_text(panel, encoding="utf-8")


def write_icons():
    camera = """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <title>摄像头</title>
  <defs>
    <linearGradient id="ic-camera" x1="10" y1="12" x2="54" y2="52" gradientUnits="userSpaceOnUse">
      <stop stop-color="#9CF6FF"/><stop offset="1" stop-color="#248FE6"/>
    </linearGradient>
  </defs>
  <g stroke="url(#ic-camera)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="7" y="17" width="35" height="25" rx="4"/>
    <path d="M42 26L55 20V39L42 33"/>
    <circle cx="24" cy="29" r="5"/>
    <path d="M15 42L12 51H27L25 42"/>
    <path d="M30 51H38"/>
    <path d="M50 10C54 12 56 15 57 19" stroke-opacity="0.55"/>
    <path d="M47 6C53 8 57 12 59 18" stroke-opacity="0.3"/>
  </g>
  <circle cx="35" cy="22" r="2" fill="#FF6B6B"/>
</svg>
"""
    sensor = """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <title>传感器</title>
  <defs>
    <linearGradient id="ic-sensor" x1="8" y1="50" x2="56" y2="12" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1D7ED0"/><stop offset="1" stop-color="#9CF6FF"/>
    </linearGradient>
  </defs>
  <g stroke="url(#ic-sensor)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 31C27 26 37 26 42 31"/>
    <path d="M16 24C25 15 39 15 48 24" stroke-opacity="0.75"/>
    <path d="M10 17C23 5 41 5 54 17" stroke-opacity="0.45"/>
    <circle cx="32" cy="40" r="6"/>
    <path d="M32 46V55M21 55H43"/>
    <path d="M26 40H38M32 34V46" stroke-opacity="0.55"/>
  </g>
  <circle cx="32" cy="40" r="2.5" fill="#9CF6FF"/>
</svg>
"""
    server = """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <title>服务器</title>
  <defs>
    <linearGradient id="ic-server" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
      <stop stop-color="#9CF6FF"/><stop offset="1" stop-color="#247ED0"/>
    </linearGradient>
  </defs>
  <g stroke="url(#ic-server)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="12" y="7" width="40" height="50" rx="4"/>
    <path d="M12 24H52M12 40H52"/>
    <path d="M19 16H35M19 32H35M19 48H35"/>
    <path d="M42 16H45M42 32H45M42 48H45"/>
  </g>
  <circle cx="19" cy="16" r="1.8" fill="#6BFFA8"/>
  <circle cx="19" cy="32" r="1.8" fill="#6BFFA8"/>
  <circle cx="19" cy="48" r="1.8" fill="#5FD8FF"/>
</svg>
"""
    alarm = """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <title>告警</title>
  <defs>
    <linearGradient id="ic-alarm" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFD1A6"/><stop offset="0.4" stop-color="#FF9B4A"/><stop offset="1" stop-color="#E6543E"/>
    </linearGradient>
  </defs>
  <g stroke="url(#ic-alarm)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 42C18 26 21 18 32 18C43 18 46 26 46 42L51 49H13L18 42Z"/>
    <path d="M27 53C29 57 35 57 37 53"/>
    <path d="M8 17C4 25 4 34 7 42" stroke-opacity="0.55"/>
    <path d="M56 17C60 25 60 34 57 42" stroke-opacity="0.55"/>
    <path d="M32 26V36" stroke-width="3"/>
  </g>
  <circle cx="32" cy="42" r="2.2" fill="#FF7B5A"/>
</svg>
"""
    for name, content in (
        ("icon-camera.svg", camera),
        ("icon-sensor.svg", sensor),
        ("icon-server.svg", server),
        ("icon-alarm.svg", alarm),
    ):
        (IMAGE_DIR / name).write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# 360 equirectangular panorama
# ---------------------------------------------------------------------------


def _lerp_color(t, stops):
    if t <= stops[0][0]:
        return stops[0][1]
    if t >= stops[-1][0]:
        return stops[-1][1]
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        if p0 <= t <= p1:
            f = (t - p0) / (p1 - p0) if p1 > p0 else 0.0
            return tuple(round(a + (b - a) * f) for a, b in zip(c0, c1))
    return stops[-1][1]


def _wrap_draw(fn, draw, x):
    for offset in (-4096, 0, 4096):
        fn(draw, x + offset)


def _draw_window_grid(draw, x0, y0, x1, y1, cols, rows, color):
    if cols <= 0 or rows <= 0:
        return
    pad_x = (x1 - x0) * 0.12
    pad_y = (y1 - y0) * 0.14
    cell_w = (x1 - x0 - 2 * pad_x) / cols
    cell_h = (y1 - y0 - 2 * pad_y) / rows
    win_w = max(1, cell_w * 0.52)
    win_h = max(1, cell_h * 0.48)
    for row in range(rows):
        for col in range(cols):
            cx = x0 + pad_x + cell_w * (col + 0.5)
            cy = y0 + pad_y + cell_h * (row + 0.5)
            draw.rectangle(
                [cx - win_w / 2, cy - win_h / 2, cx + win_w / 2, cy + win_h / 2],
                fill=color,
            )


def _draw_teaching_building(draw, x, base):
    def shape(d, cx):
        w = 300
        h = 154
        d.polygon(
            [(cx - w / 2 + 8, base - h + 8), (cx + w / 2 + 14, base - h + 8),
             (cx + w / 2 + 14, base + 10), (cx - w / 2 + 8, base + 10)],
            fill=(24, 45, 36, 70),
        )
        d.rectangle([cx - w / 2, base - h, cx + w / 2, base + 6], fill=(229, 220, 202))
        d.rectangle([cx - w / 2, base - h, cx + w / 2, base - h + 10], fill=(72, 86, 92))
        d.rectangle([cx - w / 2, base - 8, cx + w / 2, base + 6], fill=(188, 180, 164))
        d.rectangle([cx - 72, base - h - 62, cx + 72, base - h + 4], fill=(226, 216, 197))
        d.rectangle([cx - 74, base - h - 62, cx + 74, base - h - 52], fill=(66, 80, 88))
        d.rectangle([cx - 8, base - h - 92, cx + 8, base - h - 62], fill=(206, 198, 181))
        d.rectangle([cx - 4, base - h - 103, cx + 4, base - h - 92], fill=(196, 70, 52))
        d.rectangle([cx - 24, base - 48, cx + 24, base + 6], fill=(54, 63, 68))
        d.rectangle([cx - 20, base - 44, cx + 20, base + 4], fill=(120, 169, 181))
        d.rectangle([cx - 34, base - 52, cx + 34, base - 45], fill=(232, 156, 68))
        _draw_window_grid(d, cx - w / 2 + 12, base - h + 18, cx + w / 2 - 12, base - 16, 16, 4, (101, 158, 178))
        for i in range(6):
            if i % 3 == 1:
                wx = cx - w / 2 + 20 + i * 46
                d.rectangle([wx, base - h + 30, wx + 15, base - h + 43], fill=(220, 241, 232))

    _wrap_draw(shape, draw, x)


def _draw_library(draw, x, base):
    def shape(d, cx):
        d.ellipse([cx - 190, base - 8, cx + 190, base + 18], fill=(31, 55, 40, 60))
        d.rectangle([cx - 172, base - 82, cx + 172, base + 5], fill=(213, 202, 180))
        d.rectangle([cx - 172, base - 82, cx + 172, base - 72], fill=(78, 82, 80))
        d.rectangle([cx - 56, base - 186, cx + 56, base + 5], fill=(174, 198, 204))
        d.rectangle([cx - 56, base - 186, cx + 56, base - 174], fill=(63, 82, 92))
        d.rectangle([cx - 62, base - 196, cx + 62, base - 186], fill=(210, 172, 94))
        d.polygon([(cx - 66, base - 196), (cx, base - 226), (cx + 66, base - 196)], fill=(195, 154, 76))
        d.rectangle([cx - 6, base - 238, cx + 6, base - 222], fill=(86, 96, 102))
        _draw_window_grid(d, cx - 164, base - 70, cx + 164, base - 8, 12, 3, (105, 148, 165))
        _draw_window_grid(d, cx - 46, base - 166, cx + 46, base - 84, 4, 6, (132, 186, 198))
        d.rectangle([cx - 20, base - 50, cx + 20, base + 4], fill=(57, 68, 74))
        for i in range(4):
            d.rectangle([cx - 120 + i * 70, base - 52, cx - 90 + i * 70, base - 20], fill=(94, 142, 158))

    _wrap_draw(shape, draw, x)


def _draw_dorms(draw, x, base):
    colors = [(231, 196, 167), (229, 190, 157), (233, 200, 171)]

    def shape(d, cx):
        for i, color in enumerate(colors):
            bx = cx - 150 + i * 110
            d.rectangle([bx, base - 138, bx + 92, base + 5], fill=color)
            d.rectangle([bx, base - 138, bx + 92, base - 128], fill=(120, 92, 76))
            _draw_window_grid(d, bx + 4, base - 128, bx + 88, base - 12, 4, 6, (99, 129, 140))
            d.rectangle([bx + 33, base - 40, bx + 59, base + 4], fill=(95, 84, 74))
            d.rectangle([bx + 4, base - 4, bx + 88, base + 5], fill=(166, 145, 124))
        for i in range(3):
            tx = cx - 170 + i * 118
            d.rectangle([tx, base - 34, tx + 5, base], fill=(80, 62, 47))
            d.ellipse([tx - 16, base - 60, tx + 21, base - 20], fill=(61, 105, 60))

    _wrap_draw(shape, draw, x)


def _draw_gym(draw, x, base):
    def shape(d, cx):
        d.ellipse([cx - 150, base - 6, cx + 150, base + 16], fill=(31, 55, 40, 60))
        d.rectangle([cx - 142, base - 34, cx + 142, base + 5], fill=(182, 188, 184))
        d.pieslice([cx - 142, base - 166, cx + 142, base + 82], start=180, end=360, fill=(76, 158, 160))
        d.pieslice([cx - 142, base - 166, cx + 142, base + 82], start=180, end=360, outline=(49, 110, 117), width=4)
        d.rectangle([cx - 34, base - 36, cx + 34, base + 5], fill=(49, 64, 72))
        d.rectangle([cx - 44, base - 44, cx + 44, base - 34], fill=(223, 224, 215))

    _wrap_draw(shape, draw, x)


def _draw_water_tower(draw, x, base):
    def shape(d, cx):
        d.polygon([(cx - 26, base), (cx - 11, base - 160), (cx + 11, base - 160), (cx + 26, base)],
                  fill=(119, 130, 132))
        d.line([(cx - 24, base), (cx + 24, base)], fill=(91, 101, 103), width=4)
        d.line([(cx - 20, base - 45), (cx + 20, base - 45)], fill=(91, 101, 103), width=3)
        d.line([(cx - 15, base - 90), (cx + 15, base - 90)], fill=(91, 101, 103), width=3)
        d.rectangle([cx - 44, base - 205, cx + 44, base - 148], fill=(220, 224, 220))
        d.rectangle([cx - 44, base - 172, cx + 44, base - 156], fill=(176, 70, 58))
        d.ellipse([cx - 48, base - 218, cx + 48, base - 196], fill=(238, 240, 233))
        d.polygon([(cx - 48, base - 208), (cx, base - 236), (cx + 48, base - 208)], fill=(175, 186, 186))
        d.rectangle([cx - 3, base - 250, cx + 3, base - 234], fill=(200, 65, 52))
        d.ellipse([cx - 7, base - 244, cx + 7, base - 230], fill=(190, 229, 232))

    _wrap_draw(shape, draw, x)


def _draw_radio_mast(draw, x, base):
    def shape(d, cx):
        top = base - 390
        d.polygon([(cx - 16, base), (cx - 4, top), (cx + 4, top), (cx + 16, base)], fill=(221, 223, 216))
        segments = 13
        for i in range(segments):
            y0 = base - (base - top) * i / segments
            y1 = base - (base - top) * (i + 1) / segments
            width0 = 16 - 12 * i / segments
            width1 = 16 - 12 * (i + 1) / segments
            color = (196, 67, 55) if i % 2 else (232, 233, 226)
            d.polygon([(cx - width0, y0), (cx - width1, y1), (cx + width1, y1), (cx + width0, y0)], fill=color)
            if i < 8:
                d.line([(cx - width0, y0), (cx + width1, y1)], fill=(136, 146, 145), width=1)
                d.line([(cx + width0, y0), (cx - width1, y1)], fill=(136, 146, 145), width=1)
        d.line([(cx, top), (cx, top - 48)], fill=(210, 214, 207), width=3)
        d.line([(cx - 18, top - 30), (cx + 18, top - 30)], fill=(210, 214, 207), width=2)
        d.line([(cx - 11, top - 18), (cx + 11, top - 18)], fill=(210, 214, 207), width=2)
        d.ellipse([cx - 4, top - 54, cx + 4, top - 46], fill=(248, 87, 68))
        d.ellipse([cx - 16, top - 66, cx + 16, top - 34], outline=(248, 120, 95, 80), width=2)

    _wrap_draw(shape, draw, x)


def _draw_gate(draw, x, base):
    def shape(d, cx):
        d.rectangle([cx - 200, base - 40, cx - 86, base + 5], fill=(208, 197, 176))
        d.rectangle([cx + 86, base - 40, cx + 200, base + 5], fill=(208, 197, 176))
        for px in (cx - 84, cx + 62):
            d.rectangle([px, base - 112, px + 22, base + 5], fill=(221, 210, 188))
            d.rectangle([px - 4, base - 118, px + 26, base - 106], fill=(146, 132, 112))
        d.rectangle([cx - 92, base - 122, cx + 92, base - 94], fill=(198, 186, 163))
        d.rectangle([cx - 74, base - 114, cx + 74, base - 101], fill=(46, 72, 91))
        d.rectangle([cx - 84, base - 130, cx + 84, base - 122], fill=(150, 137, 116))
        d.polygon([(cx - 104, base - 130), (cx, base - 146), (cx + 104, base - 130), (cx + 92, base - 124),
                   (cx, base - 139), (cx - 92, base - 124)], fill=(172, 72, 57))
        d.ellipse([cx - 16, base - 108, cx + 16, base - 90], outline=(255, 215, 120), width=2)
        d.line([(cx, base - 106), (cx, base - 94)], fill=(255, 215, 120), width=2)

    _wrap_draw(shape, draw, x)


def _draw_tree(draw, x, base, scale=1.0, tone=0):
    def shape(d, cx):
        trunk_w = max(2, int(4 * scale))
        trunk_h = 26 * scale
        d.rectangle([cx - trunk_w / 2, base - trunk_h, cx + trunk_w / 2, base], fill=(81, 61, 42))
        colors = [(52, 101, 57), (67, 121, 63), (82, 137, 72)]
        c = colors[tone % 3]
        d.ellipse([cx - 20 * scale, base - 52 * scale, cx + 20 * scale, base - 14 * scale], fill=c)
        d.ellipse([cx - 14 * scale, base - 65 * scale, cx + 16 * scale, base - 30 * scale], fill=tuple(min(255, v + 14) for v in c))
        d.ellipse([cx - 15 * scale, base - 18 * scale, cx + 15 * scale, base + 2 * scale], fill=(43, 76, 44, 80))

    _wrap_draw(shape, draw, x)


def _draw_landmarks(img: Image.Image):
    draw = ImageDraw.Draw(img, "RGBA")
    horizon = img.height // 2
    base = horizon + 5

    # A ring road around the viewer and a soft distant tree line.
    draw.rectangle([0, base + 7, img.width, base + 17], fill=(205, 202, 186, 120))
    draw.rectangle([0, base + 10, img.width, base + 11], fill=(238, 235, 218, 120))
    draw.rectangle([0, base + 54, img.width, base + 59], fill=(192, 187, 163, 70))

    for i in range(90):
        tx = int((i * 0.786 + 23) % 4096)
        _draw_tree(draw, tx, base + 1, scale=0.5 + (i % 4) * 0.08, tone=i)

    _draw_gate(draw, 225, base)
    _draw_teaching_building(draw, int(4096 * 0.17), base)
    _draw_library(draw, int(4096 * 0.30), base)
    _draw_dorms(draw, int(4096 * 0.435), base)
    _draw_water_tower(draw, int(4096 * 0.56), base)
    _draw_gym(draw, int(4096 * 0.685), base)
    _draw_radio_mast(draw, int(4096 * 0.81), base)

    # Foreground trees at both sides of the main cluster.
    for tx, scale in (
        (320, 1.25), (520, 0.9), (390, 0.75),
        (980, 1.15), (1110, 0.85),
        (1370, 1.0), (1540, 0.8), (1660, 0.95),
        (2060, 0.9), (2160, 0.75), (2400, 1.0),
        (2700, 0.8), (2890, 0.9), (3070, 0.8),
        (3370, 1.0), (3520, 0.75), (3690, 0.9), (3820, 0.7),
    ):
        _draw_tree(draw, tx, base + 8, scale=scale, tone=tx)

    # Low flower patches on the lawn for a little warmth.
    rng = random.Random(404)
    for _ in range(120):
        x = rng.randrange(0, 4096)
        y = rng.randrange(horizon + 30, 2020)
        radius = rng.choice((1, 1, 2))
        color = rng.choice([(230, 191, 105, 85), (213, 137, 120, 70), (246, 240, 207, 65)])
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)


def panorama(path: Path):
    width, height = 4096, 2048
    horizon = height // 2
    sky_stops = [
        (0.0, (17, 47, 95)),
        (0.3, (42, 99, 156)),
        (0.62, (95, 158, 199)),
        (0.84, (164, 202, 222)),
        (0.97, (232, 212, 180)),
        (1.0, (247, 223, 190)),
    ]
    ground_stops = [
        (0.0, (131, 146, 103)),
        (0.06, (102, 128, 79)),
        (0.24, (74, 108, 61)),
        (0.6, (51, 86, 49)),
        (1.0, (31, 55, 37)),
    ]

    row_colors = np.empty((height, 3), dtype=np.uint8)
    for y in range(height):
        if y < horizon:
            row_colors[y] = _lerp_color(y / horizon, sky_stops)
        else:
            row_colors[y] = _lerp_color((y - horizon) / (height - horizon), ground_stops)
    arr = np.empty((height, width, 3), dtype=np.uint8)
    arr[:] = row_colors[:, None, :]

    # Very subtle, wrap-safe longitudinal light variation in the sky.
    x = np.arange(width, dtype=np.float32)
    sky_mod = (
        np.sin(2 * math.pi * 2 * x / width + 0.4) * 2.2
        + np.sin(2 * math.pi * 6 * x / width + 1.9) * 1.2
    )
    sky_region = arr[:horizon].astype(np.int16)
    sky_region[:, :, 0] = np.clip(sky_region[:, :, 0] + sky_mod, 0, 255)
    sky_region[:, :, 1] = np.clip(sky_region[:, :, 1] + sky_mod * 0.8, 0, 255)
    sky_region[:, :, 2] = np.clip(sky_region[:, :, 2] + sky_mod * 1.4, 0, 255)
    arr[:horizon] = sky_region.astype(np.uint8)

    # Smooth sun glow on a local patch. The alpha is forced to zero at the
    # patch edge so the composite has no visible rectangle boundary.
    sx, sy = int(width * 0.715), int(height * 0.29)
    patch_radius = 520
    x0, x1 = sx - patch_radius, sx + patch_radius
    y0, y1 = sy - patch_radius, sy + patch_radius
    patch_yy, patch_xx = np.mgrid[y0:y1, x0:x1]
    dist2 = (patch_xx - sx) ** 2 + (patch_yy - sy) ** 2
    raw = 0.9 * np.exp(-dist2 / (2 * 150**2)) + 0.32 * np.exp(-dist2 / (2 * 360**2))
    edge = 0.9 * math.exp(-(patch_radius**2) / (2 * 150**2)) + 0.32 * math.exp(
        -(patch_radius**2) / (2 * 360**2)
    )
    alpha = np.clip((raw - edge) / (1.0 - edge), 0.0, 1.0)
    patch = arr[y0:y1, x0:x1].astype(np.float32)
    sun_color = np.array([255, 242, 214], dtype=np.float32)
    patch = patch * (1.0 - alpha[..., None]) + sun_color * alpha[..., None]
    arr[y0:y1, x0:x1] = np.clip(patch, 0, 255).astype(np.uint8)

    img = Image.fromarray(arr, "RGB")
    draw = ImageDraw.Draw(img, "RGBA")
    draw.ellipse([sx - 22, sy - 22, sx + 22, sy + 22], fill=(255, 250, 230, 255))

    # Clouds with soft mask, horizontally wrapped.
    cloud_mask = Image.new("L", (width, height), 0)
    cloud_draw = ImageDraw.Draw(cloud_mask)
    cloud_rng = random.Random(505)
    for _ in range(22):
        cx = cloud_rng.randrange(0, width)
        cy = cloud_rng.randrange(320, 900)
        cloud_w = cloud_rng.randrange(150, 420)
        cloud_h = cloud_rng.randrange(22, 58)
        intensity = cloud_rng.randrange(110, 205)
        puffs = []
        for _k in range(4):
            puffs.append(
                (
                    cloud_rng.uniform(-cloud_w * 0.3, cloud_w * 0.3),
                    cloud_rng.uniform(-cloud_h * 0.25, cloud_h * 0.25),
                    cloud_w * cloud_rng.uniform(0.5, 1.0),
                    cloud_h * cloud_rng.uniform(0.6, 1.2),
                )
            )
        for off in (-width, 0, width):
            for ox, oy, rw, rh in puffs:
                cloud_draw.ellipse(
                    [cx + off + ox - rw / 2, cy + oy - rh / 2, cx + off + ox + rw / 2, cy + oy + rh / 2],
                    fill=intensity,
                )
    cloud_mask = cloud_mask.filter(ImageFilter.GaussianBlur(20))
    cloud_layer = Image.new("RGB", (width, height), (244, 247, 246))
    img = Image.composite(cloud_layer, img, cloud_mask)
    draw = ImageDraw.Draw(img, "RGBA")

    # Layered distant hills, built from wrap-safe harmonics.
    xs = np.arange(width)
    far_ridge = (
        horizon - 22
        - (48 + 28 * np.sin(2 * math.pi * 3 * xs / width + 0.6)
           + 17 * np.sin(2 * math.pi * 8 * xs / width + 2.0)
           + 8 * np.sin(2 * math.pi * 17 * xs / width + 0.2))
    )
    near_ridge = (
        horizon - 6
        - (26 + 20 * np.sin(2 * math.pi * 5 * xs / width + 1.4)
           + 11 * np.sin(2 * math.pi * 11 * xs / width + 0.8)
           + 5 * np.sin(2 * math.pi * 23 * xs / width + 2.2))
    )
    far_poly = [(int(xs[0]), horizon + 12)] + [(int(xs[i]), float(far_ridge[i])) for i in range(width)] + [(int(xs[-1]), horizon + 12)]
    near_poly = [(int(xs[0]), horizon + 10)] + [(int(xs[i]), float(near_ridge[i])) for i in range(width)] + [(int(xs[-1]), horizon + 10)]
    draw.polygon(far_poly, fill=(122, 153, 160, 235))
    draw.polygon(near_poly, fill=(83, 120, 92, 245))

    # Warm horizon haze.
    for i, alpha in enumerate((14, 22, 30, 42, 30, 18)):
        draw.rectangle([0, horizon - 30 + i * 12, width, horizon - 20 + i * 12], fill=(248, 232, 205, alpha))

    # Grass texture: broad, low-alpha wrapped patches.
    patch_rng = random.Random(606)
    for _ in range(90):
        cx = patch_rng.randrange(0, width)
        cy = patch_rng.randrange(horizon + 40, height - 40)
        rx = patch_rng.randrange(60, 300)
        ry = patch_rng.randrange(12, 55)
        color = patch_rng.choice(
            [(110, 137, 82, 10), (48, 83, 48, 12), (94, 127, 72, 8), (146, 156, 102, 7)]
        )
        for off in (-width, 0, width):
            draw.ellipse([cx + off - rx, cy - ry, cx + off + rx, cy + ry], fill=color)

    for i, y in enumerate(range(horizon + 36, height, 78)):
        if i % 2 == 0:
            draw.rectangle([0, y, width, y + 44], fill=(165, 184, 116, 5))
    _draw_landmarks(img)

    # A few birds.
    bird_draw = ImageDraw.Draw(img, "RGBA")

    def bird(cx, cy, size):
        for off in (-width, 0, width):
            bird_draw.arc([cx + off - size, cy - size / 2, cx + off, cy + size / 2], start=200, end=340, fill=(48, 66, 74, 140), width=2)
            bird_draw.arc([cx + off, cy - size / 2, cx + off + size, cy + size / 2], start=200, end=340, fill=(48, 66, 74, 140), width=2)

    for cx, cy, size in ((1180, 430, 16), (1215, 460, 11), (1250, 420, 9), (2860, 360, 13)):
        bird(cx, cy, size)

    img.save(path, format="JPEG", quality=91, optimize=True, progressive=True)


def main():
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    background_grid(IMAGE_DIR / "bg-tech-grid.jpg")
    background_aurora(IMAGE_DIR / "bg-tech-aurora.jpg")
    background_wave(IMAGE_DIR / "bg-tech-wave.jpg")
    write_title_decor()
    write_title_borders()
    write_icons()
    panorama(IMAGE_DIR / "panorama-demo.jpg")

    for path in sorted(IMAGE_DIR.iterdir()):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
