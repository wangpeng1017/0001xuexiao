#!/usr/bin/env python3
"""Validate every generated seed asset and write _generators/SUMMARY.md."""

from __future__ import annotations

import io
import json
import math
import struct
import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
from PIL import Image

from generate_manifest import ASSETS, build_manifest

SEED_ROOT = Path(__file__).resolve().parents[1]
SUMMARY_PATH = Path(__file__).resolve().parent / "SUMMARY.md"
ALLOWED_CATEGORIES = {"model", "map", "image2d"}
ALLOWED_BUILDING_TYPES = {"教学楼", "宿舍", "食堂", "实验楼", "体育馆"}
BBOX = (116.30, 39.99, 116.32, 40.01)
COMPONENT = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
TYPE_COMPONENTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


class ValidationError(AssertionError):
    pass


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def human_size(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / 1024 / 1024:.2f} MB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes} B"


def read_accessor(gltf, bin_data, index):
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    fmt, comp_size = COMPONENT[accessor["componentType"]]
    components = TYPE_COMPONENTS[accessor["type"]]
    count = accessor["count"] * components
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    require(offset % comp_size == 0, f"accessor {index} is not aligned")
    require(
        offset + count * comp_size <= view.get("byteOffset", 0) + view["byteLength"],
        f"accessor {index} exceeds its bufferView",
    )
    values = struct.unpack_from(f"<{count}{fmt}", bin_data, offset)
    if components == 1:
        return list(values)
    return [values[i : i + components] for i in range(0, len(values), components)]


def parse_glb(path: Path):
    raw = path.read_bytes()
    require(len(raw) >= 20, "file is too small to be a GLB")
    magic, version, total_length = struct.unpack_from("<III", raw, 0)
    require(magic == 0x46546C67, "bad GLB magic")
    require(version == 2, "GLB version is not 2")
    require(total_length == len(raw), "GLB header length does not match file size")

    chunks = []
    offset = 12
    while offset < len(raw):
        require(offset + 8 <= len(raw), "truncated chunk header")
        length, chunk_type = struct.unpack_from("<II", raw, offset)
        payload = raw[offset + 8 : offset + 8 + length]
        require(len(payload) == length, "truncated chunk payload")
        chunks.append((chunk_type, payload))
        offset += 8 + length
    require(len(chunks) >= 2, "GLB must contain JSON and BIN chunks")
    require(chunks[0][0] == 0x4E4F534A, "first chunk is not JSON")
    require(chunks[1][0] == 0x004E4942, "second chunk is not BIN")
    require(len(chunks[0][1]) % 4 == 0, "JSON chunk is not 4-byte aligned")
    require(len(chunks[1][1]) % 4 == 0, "BIN chunk is not 4-byte aligned")
    gltf = json.loads(chunks[0][1].decode("utf-8"))
    bin_data = chunks[1][1]
    return gltf, bin_data


def validate_glb(path: Path):
    require(path.stat().st_size <= 2 * 1024 * 1024, "GLB exceeds the 2 MB budget")
    gltf, bin_data = parse_glb(path)
    require(gltf.get("asset", {}).get("version") == "2.0", "asset.version is not 2.0")
    require(gltf.get("buffers"), "missing buffers")
    require(len(gltf["buffers"]) == 1, "expected exactly one buffer")
    require(gltf["buffers"][0]["byteLength"] == len(bin_data), "buffer byteLength mismatch")
    require(gltf.get("scenes") and gltf.get("nodes") and gltf.get("meshes"), "missing scene graph")
    require(gltf["scene"] == 0, "unexpected default scene")
    require(len(gltf["meshes"]) == 1, "expected one mesh")
    require(gltf["nodes"][0].get("mesh") == 0, "scene node does not reference mesh 0")

    views = gltf.get("bufferViews", [])
    for view_index, view in enumerate(views):
        require(view.get("buffer") == 0, f"bufferView {view_index} uses a missing buffer")
        start = view.get("byteOffset", 0)
        require(start % 4 == 0, f"bufferView {view_index} is not 4-byte aligned")
        require(start + view["byteLength"] <= len(bin_data), f"bufferView {view_index} is out of range")

    accessor_kinds = {}
    for accessor_index, accessor in enumerate(gltf.get("accessors", [])):
        require(accessor.get("bufferView") is not None, f"accessor {accessor_index} has no bufferView")
        require(accessor["bufferView"] < len(views), f"accessor {accessor_index} has a bad bufferView")
        fmt, comp_size = COMPONENT[accessor["componentType"]]
        components = TYPE_COMPONENTS[accessor["type"]]
        byte_length = accessor["count"] * components * comp_size
        view = views[accessor["bufferView"]]
        accessor_offset = accessor.get("byteOffset", 0)
        require(
            accessor_offset + byte_length <= view["byteLength"],
            f"accessor {accessor_index} exceeds its bufferView",
        )
        values = read_accessor(gltf, bin_data, accessor_index)
        accessor_kinds[accessor_index] = (accessor, values)
        if accessor.get("min") is not None:
            require(len(accessor["min"]) == components, f"accessor {accessor_index} min size mismatch")
            for i in range(components):
                actual = min(v[i] for v in values)
                require(
                    abs(actual - accessor["min"][i]) < 1e-5,
                    f"accessor {accessor_index} min[{i}] mismatch ({actual} vs {accessor['min'][i]})",
                )
        if accessor.get("max") is not None:
            for i in range(components):
                actual = max(v[i] for v in values)
                require(
                    abs(actual - accessor["max"][i]) < 1e-5,
                    f"accessor {accessor_index} max[{i}] mismatch ({actual} vs {accessor['max'][i]})",
                )

    materials = gltf.get("materials", [])
    require(materials, "missing materials")
    for index, material in enumerate(materials):
        pbr = material.get("pbrMetallicRoughness", {})
        color = pbr.get("baseColorFactor")
        require(color is not None and len(color) == 4, f"material {index} has no RGBA baseColorFactor")
        require(all(0.0 <= value <= 1.0 for value in color), f"material {index} colour is out of range")

    vertex_total = 0
    triangle_total = 0
    all_positions = []
    for primitive_index, primitive in enumerate(gltf["meshes"][0]["primitives"]):
        require(primitive.get("mode", 4) == 4, f"primitive {primitive_index} is not triangles")
        attributes = primitive.get("attributes", {})
        require("POSITION" in attributes and "NORMAL" in attributes, "primitive lacks POSITION/NORMAL")
        require("indices" in primitive, "primitive lacks indices")
        require(primitive.get("material", -1) < len(materials), "primitive has a bad material index")

        positions_accessor, positions = accessor_kinds[attributes["POSITION"]]
        normals_accessor, normals = accessor_kinds[attributes["NORMAL"]]
        indices_accessor, indices = accessor_kinds[primitive["indices"]]
        require(positions_accessor["type"] == "VEC3", "POSITION is not VEC3")
        require(normals_accessor["type"] == "VEC3", "NORMAL is not VEC3")
        require(indices_accessor["type"] == "SCALAR", "indices are not SCALAR")
        require(len(positions) == len(normals), "POSITION/NORMAL count mismatch")
        require(len(indices) % 3 == 0, "indices are not triangle indices")
        require(max(indices) < len(positions), "index out of range")
        vertex_total += len(positions)
        triangle_total += len(indices) // 3
        all_positions.extend(positions)

        for normal in normals:
            length = math.sqrt(sum(component * component for component in normal))
            require(abs(length - 1.0) < 2e-3, "normal is not unit length")

        require(
            "min" in positions_accessor and "max" in positions_accessor,
            "POSITION accessor has no min/max",
        )
        for i in range(0, len(indices), 3):
            a, b, c = indices[i], indices[i + 1], indices[i + 2]
            p0, p1, p2 = positions[a], positions[b], positions[c]
            ux, uy, uz = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
            vx, vy, vz = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
            nx, ny, nz = (
                uy * vz - uz * vy,
                uz * vx - ux * vz,
                ux * vy - uy * vx,
            )
            area = math.sqrt(nx * nx + ny * ny + nz * nz)
            require(area > 1e-10, "degenerate triangle")
            stored = normals[a]
            dot = (nx * stored[0] + ny * stored[1] + nz * stored[2]) / area
            require(dot > 0.9, "triangle winding is inverted")

    mins = [min(p[i] for p in all_positions) for i in range(3)]
    maxs = [max(p[i] for p in all_positions) for i in range(3)]

    optional_reader = "未安装"
    try:
        from pygltflib import GLTF2  # noqa: PLC0415

        loaded = GLTF2().load(str(path))
        require(loaded.asset.version == "2.0", "pygltflib read-back version mismatch")
        require(len(loaded.meshes) == 1, "pygltflib read-back mesh mismatch")
        optional_reader = "pygltflib 读回通过"
    except ImportError:
        optional_reader = "未安装 pygltflib，跳过可选读回"
    return {
        "bytes": path.stat().st_size,
        "vertices": vertex_total,
        "triangles": triangle_total,
        "mins": mins,
        "maxs": maxs,
        "primitives": len(gltf["meshes"][0]["primitives"]),
        "materials": len(materials),
        "reader": optional_reader,
    }


def validate_models():
    expected = {
        "teaching-building.glb": {
            "height": (23.5, 24.5),
            "width_x": (59.0, 63.0),
            "depth_z": (19.0, 30.0),
            "note": "60m×20m 主体，含雨棚/天线后高约 24m",
        },
        "tree.glb": {"height": (7.9, 8.1), "width_x": (4.0, 5.2), "depth_z": (4.0, 5.2)},
        "signpost.glb": {"height": (5.5, 6.5), "width_x": (1.5, 2.5), "depth_z": (0.5, 1.2)},
        "server-rack.glb": {"height": (1.9, 2.1), "width_x": (0.55, 0.7), "depth_z": (0.9, 1.2)},
    }
    info = {}
    for asset in ASSETS:
        if asset["category"] != "model":
            continue
        path = SEED_ROOT / asset["file"]
        require(path.exists(), f"missing model {asset['file']}")
        metrics = validate_glb(path)
        mins, maxs = metrics["mins"], metrics["maxs"]
        width = maxs[0] - mins[0]
        height = maxs[1] - mins[1]
        depth = maxs[2] - mins[2]
        require(abs(mins[1]) < 0.02, f"{path.name}: base is not at y=0")
        spec = expected[path.name]
        require(spec["height"][0] <= height <= spec["height"][1], f"{path.name}: height {height:.2f} out of range")
        require(spec["width_x"][0] <= width <= spec["width_x"][1], f"{path.name}: width {width:.2f} out of range")
        require(spec["depth_z"][0] <= depth <= spec["depth_z"][1], f"{path.name}: depth {depth:.2f} out of range")
        metrics["size"] = (width, height, depth)
        metrics["note"] = spec.get("note", "")
        info[asset["file"]] = metrics
    return info


def _iter_coords(geometry):
    kind = geometry["type"]
    if kind == "Point":
        yield geometry["coordinates"]
    elif kind == "LineString":
        yield from geometry["coordinates"]
    elif kind == "Polygon":
        for ring in geometry["coordinates"]:
            yield from ring


def validate_geojson():
    specs = {
        "maps/campus-roads.geojson": ("LineString", 10, "校园道路"),
        "maps/campus-buildings.geojson": ("Polygon", 12, "校园建筑轮廓"),
        "maps/campus-poi.geojson": ("Point", 16, "校园兴趣点"),
    }
    info = {}
    for filename, (geometry_type, expected_count, label) in specs.items():
        path = SEED_ROOT / filename
        require(path.exists(), f"missing {filename}")
        text = path.read_text(encoding="utf-8")
        for banned in ("国界", "省界", "行政区划", "boundary", "admin"):
            require(banned not in text, f"{filename} contains forbidden boundary keyword: {banned}")
        data = json.loads(text)
        require(data.get("type") == "FeatureCollection", f"{filename} is not a FeatureCollection")
        require(len(data["features"]) == expected_count, f"{filename}: unexpected feature count")
        for feature in data["features"]:
            require(feature["geometry"]["type"] == geometry_type, f"{filename}: unexpected geometry")
            name = feature["properties"].get("name")
            require(isinstance(name, str) and name.strip(), f"{filename}: feature without name")
            for lon, lat in _iter_coords(feature["geometry"]):
                require(BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3], f"{filename}: coordinate outside campus bbox")
            if geometry_type == "LineString":
                require(len(feature["geometry"]["coordinates"]) >= 2, f"{filename}: LineString too short")
            elif geometry_type == "Polygon":
                for ring in feature["geometry"]["coordinates"]:
                    require(len(ring) >= 4, f"{filename}: polygon ring too short")
                    require(ring[0] == ring[-1], f"{filename}: polygon ring is not closed")
                props = feature["properties"]
                require(isinstance(props.get("height"), (int, float)) and props["height"] > 0, f"{filename}: invalid height")
                require(props.get("type") in ALLOWED_BUILDING_TYPES, f"{filename}: invalid building type")
        if geometry_type == "Polygon":
            names = [feature["properties"]["name"] for feature in data["features"]]
            require("启智楼" in names, f"{filename}: expected teaching building missing")
        info[filename] = {"count": len(data["features"]), "label": label}
    return info


def _world_pixel(lon, lat, zoom, tile_size=256):
    scale = tile_size * (2**zoom)
    x = (lon + 180.0) / 360.0 * scale
    lat_rad = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * scale
    return x, y


def validate_tiles():
    path = SEED_ROOT / "maps/campus-tiles.zip"
    require(path.exists(), "missing maps/campus-tiles.zip")
    require(path.stat().st_size <= 10 * 1024 * 1024, "tile zip exceeds 10 MB")
    per_zoom = {}
    tile_sizes = set()
    tile_count = 0
    with zipfile.ZipFile(path) as zf:
        require(zf.testzip() is None, "tile zip CRC check failed")
        names = zf.namelist()
        for name in names:
            parts = name.split("/")
            require(len(parts) == 3 and parts[-1].endswith(".png"), f"unexpected zip entry {name}")
            try:
                zoom, tile_x, tile_y = int(parts[0]), int(parts[1]), int(parts[2][:-4])
            except ValueError as exc:
                raise ValidationError(f"bad tile path {name}") from exc
            require(0 <= tile_x < 2**zoom and 0 <= tile_y < 2**zoom, f"tile index out of range {name}")
            with zf.open(name) as fh:
                tile = Image.open(io.BytesIO(fh.read()))
                require(tile.size == (256, 256), f"tile {name} is not 256x256")
                tile_sizes.add(tile.size)
                per_zoom[zoom] = per_zoom.get(zoom, 0) + 1
            tile_count += 1
        require(set(per_zoom) == {14, 15, 16, 17}, f"unexpected tile zoom levels {sorted(per_zoom)}")
        for zoom in (14, 15, 16, 17):
            x_min, y_max = _world_pixel(BBOX[0], BBOX[1], zoom)
            x_max, y_min = _world_pixel(BBOX[2], BBOX[3], zoom)
            core = []
            for tx in range(int(x_min // 256), int(x_max // 256) + 1):
                for ty in range(int(y_min // 256), int(y_max // 256) + 1):
                    core.append(f"{zoom}/{tx}/{ty}.png")
            missing = [entry for entry in core if entry not in names]
            require(not missing, f"zoom {zoom} is missing required tiles: {missing[:3]}")
            require(per_zoom[zoom] >= len(core), f"zoom {zoom} tile count too low")

        # Centre tile must contain non-neutral map colours (roads/buildings/POIs).
        cx, cy = _world_pixel(116.31, 40.0, 16)
        centre_name = f"16/{int(cx // 256)}/{int(cy // 256)}.png"
        if centre_name in names:
            with zf.open(centre_name) as fh:
                centre = np.asarray(Image.open(io.BytesIO(fh.read())).convert("RGB"), dtype=np.int16)
            saturation = np.max(centre, axis=2) - np.min(centre, axis=2)
            require((saturation > 8).mean() > 0.01, "centre tile appears blank")
    require(tile_sizes == {(256, 256)}, "unexpected tile dimensions")
    return {
        "bytes": path.stat().st_size,
        "tiles": tile_count,
        "per_zoom": dict(sorted(per_zoom.items())),
    }


def validate_images():
    backgrounds = [
        "images/bg-tech-grid.jpg",
        "images/bg-tech-aurora.jpg",
        "images/bg-tech-wave.jpg",
    ]
    info = {}
    for filename in backgrounds:
        path = SEED_ROOT / filename
        require(path.exists(), f"missing {filename}")
        require(path.read_bytes()[:2] == b"\xff\xd8", f"{filename} is not JPEG")
        with Image.open(path) as image:
            require(image.size == (1920, 1080), f"{filename} is not 1920x1080")
            arr = np.asarray(image.convert("RGB"), dtype=np.float32)
            require(arr.mean() < 115, f"{filename} is too bright for a dark dashboard background")
            require(arr.std() > 8, f"{filename} looks blank")
            info[filename] = {"size": image.size, "mean": float(arr.mean()), "std": float(arr.std())}

    panorama = SEED_ROOT / "images/panorama-demo.jpg"
    require(panorama.exists(), "missing images/panorama-demo.jpg")
    with Image.open(panorama) as image:
        require(image.size == (4096, 2048), "panorama is not 4096x2048")
        arr = np.asarray(image.convert("RGB"), dtype=np.int16)
        seam = np.abs(arr[:, 0, :] - arr[:, -1, :])
        seam_mean = float(seam.mean())
        seam_max = int(seam.max())
        require(seam_mean < 2.0, f"panorama seam is discontinuous (mean {seam_mean:.2f})")
        require(seam_max < 40, f"panorama seam has a large jump ({seam_max})")
        top = arr[40:220, 200:1800, :].mean(axis=(0, 1))
        bottom = arr[1720:1900, 800:3200, :].mean(axis=(0, 1))
        require(top[2] > top[0], "panorama sky is not blue-dominant")
        require(bottom[1] > bottom[0] and bottom[1] > bottom[2], "panorama ground is not green-dominant")
        info["images/panorama-demo.jpg"] = {
            "size": image.size,
            "seam_mean": seam_mean,
            "seam_max": seam_max,
            "top_rgb": [round(float(v), 1) for v in top],
            "bottom_rgb": [round(float(v), 1) for v in bottom],
        }

    svg_files = sorted((SEED_ROOT / "images").glob("*.svg"))
    require(len(svg_files) == 8, f"expected 8 SVG files, found {len(svg_files)}")
    for path in svg_files:
        text = path.read_text(encoding="utf-8")
        require("<!DOCTYPE" not in text and "<!ENTITY" not in text, f"{path.name} contains a DTD/entity declaration")
        root = ET.fromstring(text)
        require(root.tag.endswith("svg"), f"{path.name} root element is not svg")
        require("viewBox" in root.attrib, f"{path.name} is missing viewBox")
        require(root.find("{http://www.w3.org/2000/svg}title") is not None, f"{path.name} has no <title>")
        for needle in ("<script", '<image', 'href="http'):
            require(needle not in text, f"{path.name} contains external/script content")
        info[f"images/{path.name}"] = {"bytes": path.stat().st_size, "viewBox": root.attrib["viewBox"]}
    icon_count = len(list((SEED_ROOT / "images").glob("icon-*.svg")))
    require(icon_count >= 3, "at least three SVG icons are required")
    return info


def validate_manifest_and_size():
    path = SEED_ROOT / "manifest.json"
    require(path.exists(), "missing manifest.json")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    require(manifest.get("version") == 1, "manifest version must be 1")
    require(manifest == build_manifest(), "manifest.json is out of date; rerun generate_manifest.py")
    materials = manifest["materials"]
    require(len(materials) == len(ASSETS), "manifest material count mismatch")
    seen = set()
    for material in materials:
        require(set(material) == {"file", "category", "name"}, f"unexpected manifest keys: {material}")
        require(material["category"] in ALLOWED_CATEGORIES, f"bad category {material['category']}")
        require(material["file"] not in seen, f"duplicate manifest entry {material['file']}")
        seen.add(material["file"])
        require((SEED_ROOT / material["file"]).is_file(), f"manifest file missing: {material['file']}")
        require(material["name"].strip(), "manifest entry has an empty name")

    actual = {
        str(path.relative_to(SEED_ROOT)).replace("\\", "/")
        for folder in ("models", "maps", "images")
        for path in (SEED_ROOT / folder).rglob("*")
        if path.is_file()
    }
    require(actual == seen, f"manifest mismatch; unlisted={sorted(actual - seen)}, missing={sorted(seen - actual)}")

    files = [path for path in SEED_ROOT.rglob("*") if path.is_file()]
    total = sum(path.stat().st_size for path in files)
    require(total <= 40 * 1024 * 1024, "seed-content exceeds the 40 MB budget")
    return {"total_bytes": total, "file_count": len(files)}


def write_summary(model_info, geojson_info, tile_info, image_info, size_info, checks, failures):
    lines = []
    lines.append("# F018 预置素材生成摘要")
    lines.append("")
    lines.append(f"> 生成日期：{date.today().isoformat()} ｜ 生成脚本：`server/seed-content/_generators/generate_all.py`")
    lines.append("")
    verdict = "全部校验通过" if not failures else f"存在 {len(failures)} 项失败"
    lines.append(f"**结论：{verdict}**")
    lines.append("")
    lines.append(
        f"总体积 **{human_size(size_info['total_bytes'])}**（上限 40 MB），"
        f"共 {size_info['file_count']} 个文件，其中素材 {len(ASSETS)} 个。"
    )
    lines.append("")
    lines.append("所有素材均由本地程序生成，未下载任何第三方素材，也无第三方版权。")
    lines.append("")
    lines.append("## 一、素材清单")
    lines.append("")
    lines.append("| 类别 | 文件 | 中文名称 | 体积 |")
    lines.append("|---|---|---|---|")
    category_label = {"model": "模型", "map": "地图", "image2d": "二维"}
    for asset in ASSETS:
        path = SEED_ROOT / asset["file"]
        lines.append(
            f"| {category_label[asset['category']]} | `{asset['file']}` | {asset['name']} | "
            f"{human_size(path.stat().st_size)} |"
        )
    lines.append("")
    lines.append("## 二、GLB 模型")
    lines.append("")
    lines.append("| 文件 | 体积 | 顶点 | 三角形 | 包围盒（m，X×Y×Z） | 读回 |")
    lines.append("|---|---:|---:|---:|---|---|")
    for filename, info in model_info.items():
        sx, sy, sz = info["size"]
        lines.append(
            f"| `{filename}` | {human_size(info['bytes'])} | {info['vertices']} | {info['triangles']} | "
            f"{sx:.2f}×{sy:.2f}×{sz:.2f} | {info['reader']} |"
        )
    lines.append("")
    lines.append("校验内容：GLB 头与 chunk 长度、accessor min/max 与二进制数据一致、bufferView 边界/对齐、")
    lines.append("法线单位长度、索引越界、三角形绕序、材质 baseColorFactor、底面 y=0、尺寸范围，文件均 ≤2 MB。")
    lines.append("")
    lines.append("## 三、地图与离线瓦片")
    lines.append("")
    for filename, info in geojson_info.items():
        lines.append(f"- `{filename}`：{info['count']} 个{info['label']}，坐标全部位于校园范围 116.30–116.32E / 39.99–40.01N。")
    lines.append(
        f"- `maps/campus-tiles.zip`：{tile_info['tiles']} 张 256×256 PNG，压缩后 {human_size(tile_info['bytes'])}；"
        f"各级瓦片数 " + "、".join(f"z{z}={count}" for z, count in tile_info["per_zoom"].items()) + "。"
    )
    lines.append("- 已检查 zip CRC、XYZ 路径、z=14~17 覆盖范围和瓦片尺寸；不包含任何国界/省界/行政区划数据。")
    lines.append("")
    lines.append("## 四、二维素材")
    lines.append("")
    for filename, info in image_info.items():
        if filename.endswith(".svg"):
            lines.append(f"- `{filename}`：SVG，viewBox {info['viewBox']}，XML 解析通过。")
        elif filename.endswith("panorama-demo.jpg"):
            lines.append(
                f"- `{filename}`：{info['size'][0]}×{info['size'][1]}，左右接缝平均差 "
                f"{info['seam_mean']:.2f} / 最大差 {info['seam_max']}（0–255），"
                f"天空 RGB {info['top_rgb']}，地面 RGB {info['bottom_rgb']}。"
            )
        else:
            lines.append(
                f"- `{filename}`：{info['size'][0]}×{info['size'][1]}，"
                f"平均亮度 {info['mean']:.1f}，标准差 {info['std']:.1f}。"
            )
    lines.append("")
    lines.append("## 五、校验明细")
    lines.append("")
    for check in checks:
        mark = "通过" if check["passed"] else "失败"
        lines.append(f"- [{mark}] {check['name']}" + (f" — {check['detail']}" if check.get("detail") else ""))
    if failures:
        lines.append("")
        lines.append("## 六、失败项")
        lines.append("")
        for failure in failures:
            lines.append(f"- {failure}")
        lines.append("")
        lines.append("## 七、重新生成")
    else:
        lines.append("")
        lines.append("## 六、重新生成")
    lines.append("")
    lines.append("```bash")
    lines.append("python server/seed-content/_generators/generate_all.py")
    lines.append("python server/seed-content/_generators/verify_assets.py")
    lines.append("```")
    lines.append("")
    lines.append("依赖 Python 3.11、Pillow、numpy；可选安装 pygltflib 做 GLB 读回校验。随机种子固定，重复生成结果稳定。")
    lines.append("")
    SUMMARY_PATH.write_text("\n".join(lines), encoding="utf-8")


def main():
    checks = []
    failures = []

    def run_check(name, fn):
        try:
            result = fn()
            checks.append({"name": name, "passed": True})
            return result
        except Exception as exc:  # noqa: BLE001 - report every validation failure
            checks.append({"name": name, "passed": False, "detail": str(exc)})
            failures.append(f"{name}: {exc}")
            print(f"[FAIL] {name}: {exc}")
            return None

    print("== GLB models ==")
    model_info = run_check("GLB 模型结构与几何校验（4 个）", validate_models) or {}
    for filename, info in model_info.items():
        print(
            f"[OK] {filename}: {human_size(info['bytes'])}, {info['vertices']} verts, "
            f"{info['triangles']} tris, bounds min={info['mins']} max={info['maxs']} ({info['reader']})"
        )

    print("== GeoJSON ==")
    geojson_info = run_check("GeoJSON 结构与坐标范围校验（3 个）", validate_geojson) or {}
    for filename, info in geojson_info.items():
        print(f"[OK] {filename}: {info['count']} features")

    print("== XYZ tiles ==")
    tile_info = run_check("XYZ 瓦片包（z14–17）校验", validate_tiles) or {}
    if tile_info:
        print(
            f"[OK] campus-tiles.zip: {tile_info['tiles']} tiles, "
            f"{human_size(tile_info['bytes'])}, {tile_info['per_zoom']}"
        )

    print("== 2D images ==")
    image_info = run_check("二维图片与 SVG 校验", validate_images) or {}
    if image_info:
        for filename, info in image_info.items():
            if "seam_mean" in info:
                print(
                    f"[OK] {filename}: {info['size']}, seam mean={info['seam_mean']:.2f} "
                    f"max={info['seam_max']}"
                )
            elif "size" in info:
                print(f"[OK] {filename}: {info['size']}, mean={info['mean']:.1f}")
            else:
                print(f"[OK] {filename}: SVG viewBox {info['viewBox']}")

    print("== manifest and size ==")
    size_info = run_check("manifest 完整性与总体积（≤40 MB）", validate_manifest_and_size) or {}
    if size_info:
        print(
            f"[OK] manifest={len(ASSETS)} materials, total={human_size(size_info['total_bytes'])}, "
            f"files={size_info['file_count']}"
        )

    if failures:
        print(f"\n{len(failures)} validation failure(s)")
    else:
        print("\nAll checks passed.")
    if size_info:
        try:
            write_summary(model_info, geojson_info, tile_info, image_info, size_info, checks, failures)
            print(f"Summary written to {SUMMARY_PATH}")
        except Exception as exc:  # noqa: BLE001
            print(f"[FAIL] summary write: {exc}")
            failures.append(f"summary write: {exc}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
