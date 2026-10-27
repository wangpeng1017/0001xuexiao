#!/usr/bin/env python3
"""为程序生成的 GLB 模型绘制 360x270 等轴测预览图（平面着色、画家算法）。

纯 Python：numpy + Pillow + pygltflib。输出到 server/seed-content/previews/<同名>.png。
第三方 CC0 模型自带预览图，不在此处理。
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from pygltflib import GLTF2

from generate_manifest import GENERATED_ASSETS

SEED_ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = SEED_ROOT / "previews"
WIDTH, HEIGHT = 360, 270
SUPERSAMPLE = 3
BACKGROUND = (0x10, 0x18, 0x26)
MARGIN = 0.12
LIGHT = np.array([0.45, 0.8, 0.4])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
AMBIENT = 0.38

_COMPONENT_DTYPE = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_TYPE_SIZE = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def _read_accessor(gltf: GLTF2, blob: bytes, index: int) -> np.ndarray:
    accessor = gltf.accessors[index]
    view = gltf.bufferViews[accessor.bufferView]
    dtype = np.dtype(_COMPONENT_DTYPE[accessor.componentType])
    width = _TYPE_SIZE[accessor.type]
    offset = (view.byteOffset or 0) + (accessor.byteOffset or 0)
    data = np.frombuffer(blob, dtype=dtype, count=accessor.count * width, offset=offset)
    return data.reshape(accessor.count, width) if width > 1 else data


def load_triangles(path: Path):
    """返回 (triangles[N,3,3], colors[N,3])，颜色取材质 baseColorFactor。"""
    gltf = GLTF2().load_binary(str(path))
    blob = gltf.binary_blob()
    tris, colors = [], []
    for mesh in gltf.meshes:
        for prim in mesh.primitives:
            pos = _read_accessor(gltf, blob, prim.attributes.POSITION).astype(np.float64)
            if prim.indices is not None:
                idx = _read_accessor(gltf, blob, prim.indices).astype(np.int64)
            else:
                idx = np.arange(len(pos))
            tri = pos[idx.reshape(-1, 3)]
            color = (0.8, 0.8, 0.8)
            if prim.material is not None:
                pbr = gltf.materials[prim.material].pbrMetallicRoughness
                if pbr is not None and pbr.baseColorFactor:
                    color = tuple(pbr.baseColorFactor[:3])
            tris.append(tri)
            colors.append(np.tile(np.array(color), (len(tri), 1)))
    return np.concatenate(tris), np.concatenate(colors)


def render(triangles: np.ndarray, colors: np.ndarray) -> Image.Image:
    yaw, pitch = math.radians(45), math.radians(30)
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    rot_y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rot_x = np.array([[1, 0, 0], [0, cp, sp], [0, -sp, cp]])
    rot = rot_x @ rot_y  # 先绕 Y 转，再俯仰；相机沿 +z 看向场景，z 越小越近

    pts = triangles @ rot.T
    # 面法线（世界系用于光照，视图系用于背面剔除）
    e1 = triangles[:, 1] - triangles[:, 0]
    e2 = triangles[:, 2] - triangles[:, 0]
    normal = np.cross(e1, e2)
    length = np.linalg.norm(normal, axis=1, keepdims=True)
    normal = normal / np.where(length == 0, 1, length)
    view_normal = normal @ rot.T
    keep = (length[:, 0] > 0) & (view_normal[:, 2] < 0)

    pts, normal, colors = pts[keep], normal[keep], colors[keep]
    shade = AMBIENT + (1 - AMBIENT) * np.clip(normal @ LIGHT, 0, 1)
    shaded = np.clip(colors * shade[:, None], 0, 1)

    xy = pts[:, :, :2]
    lo, hi = xy.reshape(-1, 2).min(axis=0), xy.reshape(-1, 2).max(axis=0)
    span = np.maximum(hi - lo, 1e-9)
    w, h = WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE
    scale = min(w * (1 - 2 * MARGIN) / span[0], h * (1 - 2 * MARGIN) / span[1])
    offset = np.array([w, h]) / 2 - (lo + hi) / 2 * scale * np.array([1, -1])
    screen = xy * np.array([scale, -scale]) + offset  # 屏幕 y 向下

    order = np.argsort(-pts[:, :, 2].mean(axis=1))  # 远的先画（z 大 = 远）
    image = Image.new("RGB", (w, h), BACKGROUND)
    draw = ImageDraw.Draw(image)
    for i in order:
        fill = tuple(int(c * 255 + 0.5) for c in shaded[i])
        draw.polygon([tuple(p) for p in screen[i]], fill=fill)
    return image.resize((WIDTH, HEIGHT), Image.LANCZOS)


def main():
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for asset in GENERATED_ASSETS:
        if asset["category"] != "model" or not asset.get("thumb"):
            continue
        glb = SEED_ROOT / asset["file"]
        out = SEED_ROOT / asset["thumb"]
        triangles, colors = load_triangles(glb)
        render(triangles, colors).save(out, optimize=True)
        print(f"{out.name}: {len(triangles)} tris, {out.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
