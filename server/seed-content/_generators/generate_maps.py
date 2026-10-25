#!/usr/bin/env python3
"""Write the campus GeoJSON files and a small XYZ tile package (z=14..17).

The tiles are drawn locally from the same geometry as the GeoJSON. No online
map service and no administrative boundary data are involved.
"""

from __future__ import annotations

import io
import math
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

from campus_data import BBOX, BUILDINGS, POIS, ROADS, write_geojson_files

SEED_ROOT = Path(__file__).resolve().parents[1]
MAP_DIR = SEED_ROOT / "maps"
TILE_SIZE = 256
ZOOMS = (14, 15, 16, 17)
CENTER_LAT = (BBOX[1] + BBOX[3]) / 2.0
CENTER_LON = (BBOX[0] + BBOX[2]) / 2.0

GRID_COLOR = (228, 234, 242)
BG_COLOR = (244, 247, 250)
ROAD_CASING = (208, 219, 230)
ROAD_FILL = {
    "arterial": (250, 224, 178),
    "secondary": (255, 255, 255),
    "path": (237, 243, 248),
}
ROAD_CENTER = {
    "arterial": (225, 183, 111),
    "secondary": (222, 229, 236),
    "path": (215, 225, 234),
}
BUILDING_STYLE = {
    "教学楼": ((168, 202, 232), (94, 133, 172)),
    "宿舍": ((239, 202, 168), (176, 130, 88)),
    "食堂": ((245, 214, 146), (187, 149, 79)),
    "实验楼": ((181, 216, 197), (102, 148, 124)),
    "体育馆": ((210, 190, 232), (135, 109, 169)),
}
POI_STYLE = {
    "校门": (47, 111, 213),
    "景观": (104, 153, 72),
    "运动": (219, 139, 50),
    "监控": (214, 74, 61),
    "环境监测": (42, 154, 116),
    "消防": (190, 60, 56),
}


def world_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    scale = TILE_SIZE * (2**zoom)
    x = (lon + 180.0) / 360.0 * scale
    lat_rad = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * scale
    return x, y


def meters_per_pixel(zoom: int, lat: float = CENTER_LAT) -> float:
    return 156543.03392804097 * math.cos(math.radians(lat)) / (2**zoom)


def tile_range(zoom: int, padding: int = 1):
    n = 2**zoom
    x_min, y_max = world_pixel(BBOX[0], BBOX[1], zoom)
    x_max, y_min = world_pixel(BBOX[2], BBOX[3], zoom)
    tx0 = max(0, int(math.floor(x_min / TILE_SIZE)) - padding)
    tx1 = min(n - 1, int(math.floor(x_max / TILE_SIZE)) + padding)
    ty0 = max(0, int(math.floor(y_min / TILE_SIZE)) - padding)
    ty1 = min(n - 1, int(math.floor(y_max / TILE_SIZE)) + padding)
    return tx0, tx1, ty0, ty1


def make_zoom_geometry(zoom: int):
    roads = []
    for road in ROADS:
        points = [world_pixel(lon, lat, zoom) for lon, lat in road["coords"]]
        width_px = max(1.1, road["width_m"] / meters_per_pixel(zoom))
        roads.append(
            {
                "points": points,
                "kind": road["kind"],
                "width": width_px,
            }
        )
    buildings = []
    for building in BUILDINGS:
        points = [world_pixel(lon, lat, zoom) for lon, lat in building["coords"]]
        buildings.append(
            {
                "points": points,
                "type": building["type"],
                "name": building["name"],
            }
        )
    pois = []
    for poi in POIS:
        lon, lat = poi["coords"]
        pois.append({"xy": world_pixel(lon, lat, zoom), "type": poi["type"]})
    return roads, buildings, pois


def draw_tile(zoom: int, tx: int, ty: int, geometry) -> Image.Image:
    roads, buildings, pois = geometry
    origin_x, origin_y = tx * TILE_SIZE, ty * TILE_SIZE
    image = Image.new("RGB", (TILE_SIZE, TILE_SIZE), BG_COLOR)
    draw = ImageDraw.Draw(image)

    # Fine, tile-aligned background grid.
    for pos in range(0, TILE_SIZE + 1, 64):
        draw.line([(pos, 0), (pos, TILE_SIZE)], fill=GRID_COLOR, width=1)
        draw.line([(0, pos), (TILE_SIZE, pos)], fill=GRID_COLOR, width=1)

    def local(points):
        return [(x - origin_x, y - origin_y) for x, y in points]

    # Building drop shadows.
    shadow = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    for building in buildings:
        poly = [(x - origin_x + 2.5, y - origin_y + 3.5) for x, y in building["points"]]
        shadow_draw.polygon(poly, fill=(23, 42, 58, 32))
    image = Image.alpha_composite(image.convert("RGBA"), shadow)
    draw = ImageDraw.Draw(image)

    # Roads: draw every casing first, then every fill so junctions connect.
    for road in sorted(roads, key=lambda item: item["width"]):
        points = local(road["points"])
        casing_width = max(2, round(road["width"] + road["width"] * 0.35 + 1))
        draw.line(points, fill=ROAD_CASING, width=casing_width, joint="curve")
    for road in sorted(roads, key=lambda item: item["width"]):
        points = local(road["points"])
        fill = ROAD_FILL[road["kind"]]
        width = max(1, round(road["width"]))
        draw.line(points, fill=fill, width=width, joint="curve")
        if zoom >= 16 and road["kind"] == "arterial":
            draw.line(
                points,
                fill=ROAD_CENTER[road["kind"]],
                width=max(1, round(road["width"] * 0.08)),
                joint="curve",
            )

    # Buildings.
    for building in buildings:
        fill, outline = BUILDING_STYLE.get(building["type"], ((200, 207, 214), (120, 130, 140)))
        points = local(building["points"])
        draw.polygon(points, fill=fill, outline=outline)
        if zoom >= 16:
            draw.line(points + [points[0]], fill=outline, width=2, joint="curve")

    # POI dots with a white halo.
    radius = {14: 2.0, 15: 2.4, 16: 3.0, 17: 3.8}[zoom]
    for poi in pois:
        x, y = poi["xy"][0] - origin_x, poi["xy"][1] - origin_y
        color = POI_STYLE.get(poi["type"], (76, 102, 128))
        draw.ellipse(
            [x - radius - 1.6, y - radius - 1.6, x + radius + 1.6, y + radius + 1.6],
            fill=(255, 255, 255),
        )
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)
        if zoom >= 17:
            dot = max(1.0, radius * 0.32)
            draw.ellipse([x - dot, y - dot, x + dot, y + dot], fill=(255, 255, 255))

    return image.convert("RGB")


def build_tiles():
    MAP_DIR.mkdir(parents=True, exist_ok=True)
    geojson_files = write_geojson_files(MAP_DIR)
    for path in geojson_files.values():
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")

    zip_path = MAP_DIR / "campus-tiles.zip"
    tile_count = 0
    per_zoom = {}
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for zoom in ZOOMS:
            geometry = make_zoom_geometry(zoom)
            tx0, tx1, ty0, ty1 = tile_range(zoom)
            count = 0
            for tx in range(tx0, tx1 + 1):
                for ty in range(ty0, ty1 + 1):
                    tile = draw_tile(zoom, tx, ty, geometry)
                    buffer = io.BytesIO()
                    tile.save(buffer, format="PNG", optimize=True)
                    info = zipfile.ZipInfo(
                        f"{zoom}/{tx}/{ty}.png", date_time=(2026, 10, 25, 0, 0, 0)
                    )
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o644 << 16
                    zf.writestr(info, buffer.getvalue())
                    count += 1
            per_zoom[zoom] = count
            tile_count += count
            print(
                f"z={zoom}: x {tx0}..{tx1}, y {ty0}..{ty1}, {count} tiles"
            )
    print(
        f"campus-tiles.zip: {tile_count} tiles, {zip_path.stat().st_size / 1024:.1f} KB "
        f"(counts {per_zoom})"
    )
    return geojson_files, zip_path


if __name__ == "__main__":
    build_tiles()
