#!/usr/bin/env python3
"""为程序生成的 GLB 模型绘制 360x270 等轴测预览图（平面着色、画家算法）。

纯 Python：numpy + Pillow + pygltflib。输出到 server/seed-content/previews/<同名>.png。
第三方 CC0 模型（Kenney）的 GLB 用调色板贴图上色，原图只有 64x64，这里同样用本脚本
重新渲染为 720x540（按三角形重心的 UV 取调色板颜色）。
"""

from __future__ import annotations

import math
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from pygltflib import GLTF2

from generate_manifest import GENERATED_ASSETS

SEED_ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = SEED_ROOT / "previews"
WIDTH, HEIGHT = 360, 270
SUPERSAMPLE = 3
KENNEY_COLORMAP = Path(__file__).resolve().parent / "kenney-colormap.png"  # CC0，来自 Kenney Watercraft Kit 2.0
THIRD_PARTY_WIDTH, THIRD_PARTY_HEIGHT = 720, 540
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


def _load_texture(gltf: GLTF2, blob: bytes, texture_index: int) -> np.ndarray:
    image = gltf.images[gltf.textures[texture_index].source]
    if image.bufferView is not None:
        view = gltf.bufferViews[image.bufferView]
        start = view.byteOffset or 0
        source = io.BytesIO(blob[start : start + view.byteLength])
    else:
        # Kenney 的 GLB 引用外部 Textures/colormap.png，素材包未附带，用 _generators 下的同一张调色板
        source = KENNEY_COLORMAP
    return np.asarray(Image.open(source).convert("RGB"), dtype=np.float64) / 255


def load_triangles(path: Path):
    """返回 (triangles[N,3,3], colors[N,3])。颜色取材质 baseColorFactor；有调色板贴图时按重心 UV 取色。"""
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
            pbr = None
            if prim.material is not None:
                pbr = gltf.materials[prim.material].pbrMetallicRoughness
                if pbr is not None and pbr.baseColorFactor:
                    color = tuple(pbr.baseColorFactor[:3])
            tris.append(tri)
            tex = pbr.baseColorTexture if pbr is not None else None
            if tex is not None and prim.attributes.TEXCOORD_0 is not None:
                uv = _read_accessor(gltf, blob, prim.attributes.TEXCOORD_0).astype(np.float64)
                centroid = uv[idx.reshape(-1, 3)].mean(axis=1)
                texture = _load_texture(gltf, blob, tex.index)
                th, tw = texture.shape[:2]
                px = np.clip((centroid[:, 0] % 1.0) * tw, 0, tw - 1).astype(int)
                py = np.clip((centroid[:, 1] % 1.0) * th, 0, th - 1).astype(int)
                colors.append(texture[py, px] * np.array(color))
            else:
                colors.append(np.tile(np.array(color), (len(tri), 1)))
    return np.concatenate(tris), np.concatenate(colors)


def render(
    triangles: np.ndarray, colors: np.ndarray, width: int = WIDTH, height: int = HEIGHT
) -> Image.Image:
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
    w, h = width * SUPERSAMPLE, height * SUPERSAMPLE
    scale = min(w * (1 - 2 * MARGIN) / span[0], h * (1 - 2 * MARGIN) / span[1])
    offset = np.array([w, h]) / 2 - (lo + hi) / 2 * scale * np.array([1, -1])
    screen = xy * np.array([scale, -scale]) + offset  # 屏幕 y 向下

    order = np.argsort(-pts[:, :, 2].mean(axis=1))  # 远的先画（z 大 = 远）
    image = Image.new("RGB", (w, h), BACKGROUND)
    draw = ImageDraw.Draw(image)
    for i in order:
        fill = tuple(int(c * 255 + 0.5) for c in shaded[i])
        draw.polygon([tuple(p) for p in screen[i]], fill=fill)
    return image.resize((width, height), Image.LANCZOS)


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

    manifest = json.loads((SEED_ROOT / "manifest.json").read_text(encoding="utf-8"))
    for asset in manifest["materials"]:
        if "/third-party/" not in asset["file"] or not asset.get("thumb"):
            continue
        out = SEED_ROOT / asset["thumb"]
        triangles, colors = load_triangles(SEED_ROOT / asset["file"])
        render(triangles, colors, THIRD_PARTY_WIDTH, THIRD_PARTY_HEIGHT).save(out, optimize=True)
        print(f"{out.name}: {len(triangles)} tris, {out.stat().st_size / 1024:.1f} KB (third-party)")


if __name__ == "__main__":
    main()
