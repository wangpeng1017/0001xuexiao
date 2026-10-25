#!/usr/bin/env python3
"""Write server/seed-content/manifest.json from the canonical asset list."""

from __future__ import annotations

import json
from pathlib import Path

SEED_ROOT = Path(__file__).resolve().parents[1]

ASSETS = [
    {
        "file": "models/teaching-building.glb",
        "category": "model",
        "name": "教学楼模型",
        "description": "60m×20m×24m 组合体教学楼，含亮灯窗、入口雨棚与屋顶天线。",
    },
    {
        "file": "models/tree.glb",
        "category": "model",
        "name": "景观树模型",
        "description": "8m 高三层圆锥树冠景观树，用于校园场景点缀。",
    },
    {
        "file": "models/signpost.glb",
        "category": "model",
        "name": "监控立杆模型",
        "description": "约 6m 高监控立杆，含摄像机、太阳能板与警示灯。",
    },
    {
        "file": "models/server-rack.glb",
        "category": "model",
        "name": "服务器机柜模型",
        "description": "0.6m×1m×2m 实训室机柜，带服务器面板与状态指示灯。",
    },
    {
        "file": "maps/campus-roads.geojson",
        "category": "map",
        "name": "校园道路矢量",
        "description": "10 条虚构校园道路 LineString，含道路名称、等级与宽度。",
    },
    {
        "file": "maps/campus-buildings.geojson",
        "category": "map",
        "name": "校园建筑轮廓矢量",
        "description": "12 栋虚构校园建筑 Polygon，含名称、高度与类型。",
    },
    {
        "file": "maps/campus-poi.geojson",
        "category": "map",
        "name": "校园兴趣点矢量",
        "description": "16 个校门、图书馆、监控点与环境监测点。",
    },
    {
        "file": "maps/campus-tiles.zip",
        "category": "map",
        "name": "校园离线示意瓦片（z14–17）",
        "description": "XYZ 目录结构 {z}/{x}/{y}.png，由校园矢量程序绘制的浅色示意底图。",
    },
    {
        "file": "images/bg-tech-grid.jpg",
        "category": "image2d",
        "name": "科技网格大屏背景",
        "description": "1920×1080 深蓝透视网格背景，适合综合态势大屏。",
    },
    {
        "file": "images/bg-tech-aurora.jpg",
        "category": "image2d",
        "name": "极光粒子大屏背景",
        "description": "1920×1080 蓝紫极光与同心弧线背景，适合监控中心大屏。",
    },
    {
        "file": "images/bg-tech-wave.jpg",
        "category": "image2d",
        "name": "数据波动大屏背景",
        "description": "1920×1080 深蓝数据波浪背景，适合数据分析大屏。",
    },
    {
        "file": "images/title-decor-left.svg",
        "category": "image2d",
        "name": "标题栏左侧装饰",
        "description": "透明 SVG 标题左翼，与右侧装饰镜像配套。",
    },
    {
        "file": "images/title-decor-right.svg",
        "category": "image2d",
        "name": "标题栏右侧装饰",
        "description": "透明 SVG 标题右翼，与左侧装饰镜像配套。",
    },
    {
        "file": "images/border-corners.svg",
        "category": "image2d",
        "name": "大屏四角边框",
        "description": "1920×1080 透明四角边框，可随大屏容器缩放。",
    },
    {
        "file": "images/border-panel.svg",
        "category": "image2d",
        "name": "面板科技边框",
        "description": "800×600 透明面板边框，用于图表卡片与信息面板。",
    },
    {
        "file": "images/icon-camera.svg",
        "category": "image2d",
        "name": "摄像头图标",
        "description": "64×64 线性摄像头图标，用于视频监控图层。",
    },
    {
        "file": "images/icon-sensor.svg",
        "category": "image2d",
        "name": "传感器图标",
        "description": "64×64 线性传感器图标，用于物联网设备点位。",
    },
    {
        "file": "images/icon-server.svg",
        "category": "image2d",
        "name": "服务器图标",
        "description": "64×64 线性服务器图标，用于机柜与算力资源。",
    },
    {
        "file": "images/icon-alarm.svg",
        "category": "image2d",
        "name": "告警图标",
        "description": "64×64 线性告警铃图标，用于告警列表与事件提示。",
    },
    {
        "file": "images/panorama-demo.jpg",
        "category": "image2d",
        "name": "校园 360° 全景示例图",
        "description": "4096×2048 等距柱状投影，含天空、地面与地平线地标，左右接缝连续。",
    },
]


def build_manifest() -> dict:
    return {
        "version": 1,
        "materials": [
            {"file": asset["file"], "category": asset["category"], "name": asset["name"]}
            for asset in ASSETS
        ],
    }


def main():
    path = SEED_ROOT / "manifest.json"
    payload = build_manifest()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manifest.json: {len(payload['materials'])} materials, {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
