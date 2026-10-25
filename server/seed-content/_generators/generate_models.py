#!/usr/bin/env python3
"""Generate the four procedural GLB models shipped with the asset library."""

from __future__ import annotations

import math
from pathlib import Path

from gltf_writer import GeometryBuilder

SEED_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = SEED_ROOT / "models"


def teaching_building():
    materials = {
        "wall": {
            "name": "米白外墙",
            "baseColorFactor": [0.86, 0.84, 0.78, 1.0],
            "roughnessFactor": 0.86,
        },
        "trim": {
            "name": "浅灰装饰带",
            "baseColorFactor": [0.63, 0.67, 0.69, 1.0],
            "roughnessFactor": 0.7,
        },
        "foundation": {
            "name": "深灰基座",
            "baseColorFactor": [0.34, 0.37, 0.41, 1.0],
            "roughnessFactor": 0.9,
        },
        "roof": {
            "name": "屋面",
            "baseColorFactor": [0.38, 0.42, 0.45, 1.0],
            "roughnessFactor": 0.85,
        },
        "window": {
            "name": "蓝灰玻璃",
            "baseColorFactor": [0.08, 0.27, 0.38, 1.0],
            "metallicFactor": 0.2,
            "roughnessFactor": 0.18,
        },
        "window_lit": {
            "name": "亮灯玻璃",
            "baseColorFactor": [0.56, 0.79, 0.82, 1.0],
            "metallicFactor": 0.1,
            "roughnessFactor": 0.25,
            "emissiveFactor": [0.16, 0.36, 0.4],
        },
        "door": {
            "name": "入口门",
            "baseColorFactor": [0.07, 0.12, 0.16, 1.0],
            "metallicFactor": 0.15,
            "roughnessFactor": 0.35,
        },
        "accent": {
            "name": "橙红标识",
            "baseColorFactor": [0.82, 0.34, 0.10, 1.0],
            "roughnessFactor": 0.55,
        },
        "red_light": {
            "name": "航空障碍灯",
            "baseColorFactor": [0.9, 0.1, 0.08, 1.0],
            "emissiveFactor": [0.5, 0.02, 0.02],
            "roughnessFactor": 0.4,
        },
    }
    b = GeometryBuilder(materials)

    # Base, main volume and roof details. 60 m (x) x 20 m (z), 24 m total.
    b.add_box("foundation", (0.0, 0.35, 0.0), (61.4, 0.7, 21.4))
    b.add_box("wall", (0.0, 10.35, 0.0), (60.0, 19.3, 20.0))
    b.add_box("roof", (0.0, 20.18, 0.0), (60.4, 0.36, 20.4))
    b.add_box("trim", (0.0, 19.7, 10.12), (60.2, 0.5, 0.22))
    b.add_box("trim", (0.0, 19.7, -10.12), (60.2, 0.5, 0.22))

    # Roof parapet.
    b.add_box("trim", (0.0, 20.55, 10.0), (60.4, 0.75, 0.35))
    b.add_box("trim", (0.0, 20.55, -10.0), (60.4, 0.75, 0.35))
    b.add_box("trim", (30.0, 20.55, 0.0), (0.35, 0.75, 20.4))
    b.add_box("trim", (-30.0, 20.55, 0.0), (0.35, 0.75, 20.4))

    # Central stair tower + technical box + antenna (top at 24 m).
    b.add_box("wall", (0.0, 21.35, 0.0), (26.0, 2.3, 12.0))
    b.add_box("roof", (0.0, 22.56, 0.0), (26.4, 0.32, 12.4))
    for i in range(6):
        x = -10.0 + i * 4.0
        b.add_box("window", (x, 21.45, 6.05), (2.1, 1.2, 0.14))
    b.add_box("trim", (0.0, 22.95, 0.0), (3.0, 0.5, 3.0))
    b.add_cylinder("trim", (0.0, 23.2, 0.0), 0.09, 0.06, 0.7, segments=10)
    b.add_box("red_light", (0.0, 24.0, 0.0), (0.22, 0.22, 0.22))

    # Roof equipment.
    for x in (-18.0, 17.0):
        b.add_box("roof", (x, 20.95, -3.5), (4.2, 1.3, 2.8))
        b.add_box("trim", (x, 20.95, -2.08), (3.4, 0.9, 0.08))

    # Main facade windows (front + back).
    window_index = 0
    for z_side in (1, -1):
        z = 10.02 * z_side
        for row, y in enumerate((3.1, 6.5, 9.9, 13.3, 16.7)):
            for col in range(20):
                x = -26.6 + col * 2.8
                if row == 0 and abs(x) < 4.5:
                    continue
                material = "window_lit" if window_index % 9 == 4 else "window"
                window_index += 1
                b.add_box(material, (x, y, z), (1.85, 1.7, 0.16))

    # Side facade windows.
    for x_side in (1, -1):
        x = 30.02 * x_side
        for y in (3.1, 6.5, 9.9, 13.3, 16.7):
            for col in range(7):
                z = -8.4 + col * 2.8
                material = "window_lit" if window_index % 11 == 3 else "window"
                window_index += 1
                b.add_box(material, (x, y, z), (0.16, 1.7, 1.85))

    # Entrance: steps, door, canopy and columns.
    b.add_box("foundation", (0.0, 0.12, 11.2), (9.0, 0.24, 1.4))
    b.add_box("foundation", (0.0, 0.24, 10.7), (9.6, 0.24, 0.6))
    b.add_box("door", (0.0, 2.25, 10.08), (4.6, 3.1, 0.22))
    b.add_box("window", (0.0, 2.3, 10.2), (3.2, 2.2, 0.06))
    b.add_box("accent", (0.0, 4.15, 10.26), (5.6, 0.5, 0.25))
    b.add_box("roof", (0.0, 4.45, 12.3), (11.0, 0.35, 4.6))
    for x in (-4.6, 4.6):
        b.add_cylinder("trim", (x, 0.36, 14.0), 0.24, 0.2, 4.0, segments=10)

    # A few wall-mounted signs.
    for x in (-19.0, 19.0):
        b.add_box("accent", (x, 18.1, 10.16), (2.4, 0.75, 0.12))

    return b, "教学楼"


def tree():
    materials = {
        "trunk": {
            "name": "树干",
            "baseColorFactor": [0.30, 0.20, 0.12, 1.0],
            "roughnessFactor": 0.95,
        },
        "leaf_dark": {
            "name": "深色树冠",
            "baseColorFactor": [0.08, 0.29, 0.15, 1.0],
            "roughnessFactor": 0.9,
        },
        "leaf_mid": {
            "name": "中绿树冠",
            "baseColorFactor": [0.14, 0.42, 0.21, 1.0],
            "roughnessFactor": 0.9,
        },
        "leaf_light": {
            "name": "亮绿树冠",
            "baseColorFactor": [0.24, 0.53, 0.27, 1.0],
            "roughnessFactor": 0.9,
        },
    }
    b = GeometryBuilder(materials)
    b.add_cylinder("trunk", (0.0, 0.0, 0.0), 0.31, 0.17, 3.5, segments=12)
    b.add_cone("leaf_dark", (0.0, 2.35, 0.0), 2.45, 3.25, segments=16)
    b.add_cone("leaf_mid", (0.0, 4.0, 0.0), 1.9, 2.7, segments=16)
    b.add_cone("leaf_light", (0.0, 5.3, 0.0), 1.32, 2.7, segments=16)
    return b, "景观树"


def signpost():
    materials = {
        "concrete": {
            "name": "混凝土基座",
            "baseColorFactor": [0.48, 0.49, 0.47, 1.0],
            "roughnessFactor": 0.95,
        },
        "metal": {
            "name": "银灰金属",
            "baseColorFactor": [0.58, 0.63, 0.66, 1.0],
            "metallicFactor": 0.55,
            "roughnessFactor": 0.42,
        },
        "camera": {
            "name": "摄像机外壳",
            "baseColorFactor": [0.86, 0.87, 0.85, 1.0],
            "roughnessFactor": 0.55,
        },
        "lens": {
            "name": "镜头",
            "baseColorFactor": [0.04, 0.07, 0.1, 1.0],
            "metallicFactor": 0.4,
            "roughnessFactor": 0.15,
        },
        "solar": {
            "name": "太阳能板",
            "baseColorFactor": [0.06, 0.14, 0.28, 1.0],
            "metallicFactor": 0.35,
            "roughnessFactor": 0.22,
        },
        "red_light": {
            "name": "警示灯",
            "baseColorFactor": [0.9, 0.12, 0.08, 1.0],
            "emissiveFactor": [0.45, 0.03, 0.02],
            "roughnessFactor": 0.4,
        },
        "orange": {
            "name": "橙色标识",
            "baseColorFactor": [0.9, 0.45, 0.08, 1.0],
            "roughnessFactor": 0.6,
        },
    }
    b = GeometryBuilder(materials)
    b.add_box("concrete", (0.0, 0.15, 0.0), (0.8, 0.3, 0.8))
    b.add_cylinder("metal", (0.0, 0.3, 0.0), 0.16, 0.13, 0.55, segments=12)
    b.add_cylinder("metal", (0.0, 0.3, 0.0), 0.088, 0.075, 5.7, segments=12)
    b.add_box("metal", (0.55, 5.5, 0.0), (1.15, 0.13, 0.14))
    b.add_box("metal", (0.95, 5.38, 0.0), (0.16, 0.24, 0.16))

    # Camera head with sun shield and lens.
    b.add_box("camera", (1.02, 5.22, 0.0), (0.62, 0.36, 0.78))
    b.add_box("camera", (1.02, 5.43, -0.03), (0.76, 0.08, 0.92))
    b.add_box("lens", (1.02, 5.2, -0.4), (0.34, 0.24, 0.08))
    b.add_box("red_light", (1.28, 5.3, -0.3), (0.07, 0.07, 0.05))

    # Control box, solar panel and beacon.
    b.add_box("camera", (0.0, 3.0, 0.0), (0.34, 0.52, 0.22))
    b.add_box("solar", (0.0, 6.02, 0.0), (1.18, 0.06, 0.7))
    b.add_box("orange", (0.0, 5.86, 0.0), (0.24, 0.08, 0.24))
    b.add_box("red_light", (0.0, 6.12, 0.0), (0.13, 0.15, 0.13))
    return b, "监控立杆"


def server_rack():
    materials = {
        "cabinet": {
            "name": "深灰机柜",
            "baseColorFactor": [0.12, 0.14, 0.17, 1.0],
            "metallicFactor": 0.45,
            "roughnessFactor": 0.55,
        },
        "panel": {
            "name": "前面板",
            "baseColorFactor": [0.05, 0.06, 0.08, 1.0],
            "metallicFactor": 0.2,
            "roughnessFactor": 0.6,
        },
        "server": {
            "name": "服务器面板",
            "baseColorFactor": [0.23, 0.25, 0.28, 1.0],
            "metallicFactor": 0.4,
            "roughnessFactor": 0.5,
        },
        "metal": {
            "name": "金属饰条",
            "baseColorFactor": [0.55, 0.58, 0.62, 1.0],
            "metallicFactor": 0.65,
            "roughnessFactor": 0.35,
        },
        "led_green": {
            "name": "绿色指示灯",
            "baseColorFactor": [0.15, 0.9, 0.35, 1.0],
            "emissiveFactor": [0.04, 0.5, 0.1],
            "roughnessFactor": 0.4,
        },
        "led_blue": {
            "name": "蓝色指示灯",
            "baseColorFactor": [0.15, 0.55, 0.95, 1.0],
            "emissiveFactor": [0.02, 0.2, 0.5],
            "roughnessFactor": 0.4,
        },
        "warning": {
            "name": "黄色警示条",
            "baseColorFactor": [0.92, 0.68, 0.12, 1.0],
            "roughnessFactor": 0.6,
        },
    }
    b = GeometryBuilder(materials)

    for x in (-0.24, 0.24):
        for z in (-0.4, 0.4):
            b.add_box("metal", (x, 0.03, z), (0.09, 0.06, 0.09))

    b.add_box("cabinet", (0.0, 1.03, 0.0), (0.6, 1.94, 1.0))
    b.add_box("panel", (0.0, 1.03, 0.505), (0.54, 1.88, 0.04))
    b.add_box("metal", (0.0, 1.99, 0.0), (0.62, 0.04, 0.98))
    b.add_box("warning", (0.14, 1.84, 0.529), (0.18, 0.07, 0.012))

    # Twelve 1U-style server fronts with handles and status LEDs.
    for i in range(12):
        y = 0.2 + i * 0.14
        b.add_box("server", (0.0, y, 0.531), (0.5, 0.105, 0.035))
        b.add_box("metal", (-0.218, y, 0.553), (0.028, 0.085, 0.025))
        b.add_box("metal", (0.218, y, 0.553), (0.028, 0.085, 0.025))
        b.add_box("led_green", (-0.15, y, 0.551), (0.025, 0.022, 0.012))
        b.add_box("led_blue", (-0.11, y, 0.551), (0.025, 0.022, 0.012))
        for vent in range(4):
            b.add_box("panel", (0.02 + vent * 0.038, y, 0.551), (0.02, 0.055, 0.008))

    # Side ventilation slots and top fan grills.
    for side in (-1, 1):
        for i in range(7):
            z = -0.35 + i * 0.12
            b.add_box("panel", (0.302 * side, 1.25, z), (0.012, 0.5, 0.055))
    for x in (-0.14, 0.14):
        b.add_box("panel", (x, 2.012, 0.0), (0.2, 0.012, 0.42))
    return b, "服务器机柜"


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    models = {
        "teaching-building.glb": teaching_building,
        "tree.glb": tree,
        "signpost.glb": signpost,
        "server-rack.glb": server_rack,
    }
    for filename, factory in models.items():
        builder, mesh_name = factory()
        out = MODEL_DIR / filename
        builder.build_glb(out, mesh_name)
        bounds = builder.bounds()
        size_kb = out.stat().st_size / 1024
        mins, maxs = bounds
        print(
            f"{filename}: {size_kb:.1f} KB, "
            f"{builder.vertex_count()} verts, {builder.triangle_count()} tris, "
            f"bounds min=({mins[0]:.2f}, {mins[1]:.2f}, {mins[2]:.2f}) "
            f"max=({maxs[0]:.2f}, {maxs[1]:.2f}, {maxs[2]:.2f})"
        )


if __name__ == "__main__":
    main()
