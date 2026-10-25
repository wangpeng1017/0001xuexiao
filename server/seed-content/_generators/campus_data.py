"""Fictional campus geometry shared by the GeoJSON writer and the tile renderer.

All coordinates are WGS84 lon/lat inside a small fictional campus in Beijing.
There is deliberately no administrative-boundary data in this file.
"""

from __future__ import annotations

import json
from pathlib import Path

CAMPUS_NAME = "启明大学（虚拟校园）"
BBOX = (116.30, 39.99, 116.32, 40.01)

ROADS = [
    {
        "name": "学府大道",
        "kind": "arterial",
        "width_m": 16,
        "coords": [
            (116.3008, 40.0028),
            (116.3045, 40.0031),
            (116.3085, 40.0033),
            (116.3125, 40.0031),
            (116.3160, 40.0028),
            (116.3192, 40.0029),
        ],
    },
    {
        "name": "明理路",
        "kind": "arterial",
        "width_m": 12,
        "coords": [
            (116.3105, 39.9908),
            (116.3107, 39.9945),
            (116.3109, 39.9985),
            (116.3110, 40.0025),
            (116.3108, 40.0060),
            (116.3109, 40.0092),
        ],
    },
    {
        "name": "东环路",
        "kind": "secondary",
        "width_m": 8,
        "coords": [
            (116.3181, 39.9912),
            (116.3183, 39.9950),
            (116.3185, 39.9995),
            (116.3184, 40.0034),
            (116.3182, 40.0070),
            (116.3180, 40.0090),
        ],
    },
    {
        "name": "西环路",
        "kind": "secondary",
        "width_m": 8,
        "coords": [
            (116.3024, 39.9912),
            (116.3023, 39.9955),
            (116.3025, 40.0000),
            (116.3027, 40.0045),
            (116.3026, 40.0088),
        ],
    },
    {
        "name": "北环路",
        "kind": "secondary",
        "width_m": 8,
        "coords": [
            (116.3026, 40.0085),
            (116.3060, 40.0084),
            (116.3108, 40.0086),
            (116.3150, 40.0084),
            (116.3182, 40.0086),
        ],
    },
    {
        "name": "南环路",
        "kind": "secondary",
        "width_m": 8,
        "coords": [
            (116.3024, 39.9914),
            (116.3060, 39.9913),
            (116.3105, 39.9915),
            (116.3150, 39.9914),
            (116.3182, 39.9913),
        ],
    },
    {
        "name": "博学路",
        "kind": "secondary",
        "width_m": 7,
        "coords": [
            (116.3109, 40.0050),
            (116.3130, 40.0052),
            (116.3150, 40.0050),
            (116.3178, 40.0051),
        ],
    },
    {
        "name": "求实路",
        "kind": "secondary",
        "width_m": 7,
        "coords": [
            (116.3025, 39.9972),
            (116.3050, 39.9973),
            (116.3072, 39.9971),
            (116.3106, 39.9972),
        ],
    },
    {
        "name": "实训路",
        "kind": "path",
        "width_m": 6,
        "coords": [
            (116.3148, 40.0031),
            (116.3149, 40.0050),
            (116.3148, 40.0072),
            (116.3147, 40.0084),
        ],
    },
    {
        "name": "公寓路",
        "kind": "secondary",
        "width_m": 7,
        "coords": [
            (116.3108, 39.9948),
            (116.3132, 39.9949),
            (116.3155, 39.9948),
            (116.3182, 39.9947),
        ],
    },
]


BUILDINGS = [
    {
        "name": "启智楼",
        "type": "教学楼",
        "height": 24,
        "coords": [
            (116.3038, 40.0056),
            (116.3052, 40.0056),
            (116.3052, 40.0060),
            (116.3044, 40.0060),
            (116.3044, 40.0065),
            (116.3038, 40.0065),
        ],
    },
    {
        "name": "明德楼",
        "type": "教学楼",
        "height": 21,
        "coords": [
            (116.3060, 40.0056),
            (116.3074, 40.0056),
            (116.3074, 40.0064),
            (116.3060, 40.0064),
        ],
    },
    {
        "name": "实训中心",
        "type": "实验楼",
        "height": 20,
        "coords": [
            (116.3126, 40.0036),
            (116.3142, 40.0036),
            (116.3142, 40.0045),
            (116.3126, 40.0045),
        ],
    },
    {
        "name": "实验楼A",
        "type": "实验楼",
        "height": 18,
        "coords": [
            (116.3155, 40.0057),
            (116.3164, 40.0057),
            (116.3164, 40.0064),
            (116.3155, 40.0064),
        ],
    },
    {
        "name": "实验楼B",
        "type": "实验楼",
        "height": 18,
        "coords": [
            (116.3168, 40.0057),
            (116.3177, 40.0057),
            (116.3177, 40.0064),
            (116.3168, 40.0064),
        ],
    },
    {
        "name": "学生食堂",
        "type": "食堂",
        "height": 12,
        "coords": [
            (116.3040, 39.9958),
            (116.3052, 39.9958),
            (116.3052, 39.9966),
            (116.3040, 39.9966),
        ],
    },
    {
        "name": "教工食堂",
        "type": "食堂",
        "height": 10,
        "coords": [
            (116.3060, 39.9958),
            (116.3068, 39.9958),
            (116.3068, 39.9966),
            (116.3060, 39.9966),
        ],
    },
    {
        "name": "学生公寓1号楼",
        "type": "宿舍",
        "height": 30,
        "coords": [
            (116.3125, 39.9922),
            (116.3132, 39.9922),
            (116.3132, 39.9934),
            (116.3125, 39.9934),
        ],
    },
    {
        "name": "学生公寓2号楼",
        "type": "宿舍",
        "height": 30,
        "coords": [
            (116.3136, 39.9922),
            (116.3143, 39.9922),
            (116.3143, 39.9934),
            (116.3136, 39.9934),
        ],
    },
    {
        "name": "学生公寓3号楼",
        "type": "宿舍",
        "height": 30,
        "coords": [
            (116.3147, 39.9922),
            (116.3154, 39.9922),
            (116.3154, 39.9934),
            (116.3147, 39.9934),
        ],
    },
    {
        "name": "学生公寓4号楼",
        "type": "宿舍",
        "height": 30,
        "coords": [
            (116.3158, 39.9922),
            (116.3165, 39.9922),
            (116.3165, 39.9934),
            (116.3158, 39.9934),
        ],
    },
    {
        "name": "体育馆",
        "type": "体育馆",
        "height": 20,
        "coords": [
            (116.30675, 39.99255),
            (116.30765, 39.99235),
            (116.30855, 39.99255),
            (116.30885, 39.99295),
            (116.30875, 39.99345),
            (116.30785, 39.99365),
            (116.30695, 39.99345),
            (116.30665, 39.99305),
        ],
    },
]


POIS = [
    {"name": "东校门", "type": "校门", "coords": (116.3183, 40.0030)},
    {"name": "南校门", "type": "校门", "coords": (116.3107, 39.9908)},
    {"name": "北校门", "type": "校门", "coords": (116.3108, 40.0090)},
    {"name": "中心广场", "type": "景观", "coords": (116.3107, 40.0020)},
    {"name": "图书馆", "type": "景观", "coords": (116.3095, 40.0024)},
    {"name": "学府花园", "type": "景观", "coords": (116.3095, 40.0005)},
    {"name": "体育场", "type": "运动", "coords": (116.3058, 39.9929)},
    {"name": "监控点位-东门", "type": "监控", "coords": (116.3179, 40.0032)},
    {"name": "监控点位-食堂", "type": "监控", "coords": (116.3046, 39.9960)},
    {"name": "监控点位-宿舍区", "type": "监控", "coords": (116.3144, 39.9930)},
    {"name": "监控点位-实验楼", "type": "监控", "coords": (116.3160, 40.0061)},
    {"name": "空气监测站", "type": "环境监测", "coords": (116.3098, 40.0045)},
    {"name": "噪声监测点", "type": "环境监测", "coords": (116.3165, 40.0008)},
    {"name": "水质监测点", "type": "环境监测", "coords": (116.3118, 39.9988)},
    {"name": "消防栓-主楼", "type": "消防", "coords": (116.3044, 40.0052)},
    {"name": "气象观测点", "type": "环境监测", "coords": (116.3065, 39.9920)},
]


def _closed_ring(coords):
    ring = [list(p) for p in coords]
    if ring[0] != ring[-1]:
        ring.append(list(ring[0]))
    return ring


def roads_geojson():
    features = []
    for road in ROADS:
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [list(p) for p in road["coords"]],
                },
                "properties": {
                    "name": road["name"],
                    "kind": road["kind"],
                    "width_m": road["width_m"],
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "name": "启明大学校园道路",
        "features": features,
    }


def buildings_geojson():
    features = []
    for building in BUILDINGS:
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [_closed_ring(building["coords"])],
                },
                "properties": {
                    "name": building["name"],
                    "height": building["height"],
                    "type": building["type"],
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "name": "启明大学校园建筑轮廓",
        "features": features,
    }


def poi_geojson():
    features = []
    for poi in POIS:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(poi["coords"])},
                "properties": {"name": poi["name"], "type": poi["type"]},
            }
        )
    return {
        "type": "FeatureCollection",
        "name": "启明大学校园兴趣点",
        "features": features,
    }


def write_geojson_files(out_dir: Path) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "roads": out_dir / "campus-roads.geojson",
        "buildings": out_dir / "campus-buildings.geojson",
        "poi": out_dir / "campus-poi.geojson",
    }
    payloads = {
        "roads": roads_geojson(),
        "buildings": buildings_geojson(),
        "poi": poi_geojson(),
    }
    for key, path in files.items():
        path.write_text(
            json.dumps(payloads[key], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return files
