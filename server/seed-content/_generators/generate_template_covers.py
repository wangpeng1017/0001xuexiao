#!/usr/bin/env python3
"""生成场景模板封面示意图（PNG）。

输出到 server/seed-content/templates/：
  campus-3d.png / device-monitor.png / teaching-stats.png

封面为纯程序绘制的布局示意图（深色底 + 标题 + 色块），
不依赖任何外部图片，可离线重复生成。
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "templates"
SIZE = (1280, 720)

FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    print("警告：未找到中文字体，中文可能显示为方块", file=sys.stderr)
    return ImageFont.load_default()


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    width, height = size
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return image


def draw_grid(image: Image.Image) -> None:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x in range(0, image.width, 40):
        draw.line([(x, 0), (x, image.height)], fill=(63, 208, 255, 16), width=1)
    for y in range(0, image.height, 40):
        draw.line([(0, y), (image.width, y)], fill=(63, 208, 255, 16), width=1)
    image.paste(Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB"))


def rounded_block(
    image: Image.Image,
    box: tuple[int, int, int, int],
    label: str,
    accent: tuple[int, int, int],
    label_font: ImageFont.FreeTypeFont,
    fill_alpha: int = 70,
) -> None:
    overlay = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    odraw.rounded_rectangle(
        [0, 0, overlay.width - 1, overlay.height - 1],
        radius=12,
        fill=(*accent, fill_alpha),
        outline=(*accent, 235),
        width=2,
    )
    image.paste(overlay, (box[0], box[1]), overlay)
    draw = ImageDraw.Draw(image)
    bbox = label_font.getbbox(label)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    draw.text(
        (box[0] + (box[2] - box[0] - text_width) / 2, box[1] + (box[3] - box[1] - text_height) / 2 - 4),
        label,
        font=label_font,
        fill=(225, 244, 255),
    )


def draw_header(draw: ImageDraw.ImageDraw, title: str, subtitle: str) -> None:
    title_font = load_font(52)
    sub_font = load_font(22)
    bbox = draw.textbbox((0, 0), title, font=title_font)
    draw.text(((SIZE[0] - (bbox[2] - bbox[0])) / 2, 40), title, font=title_font, fill=(127, 231, 255))
    sub_bbox = draw.textbbox((0, 0), subtitle, font=sub_font)
    draw.text(
        ((SIZE[0] - (sub_bbox[2] - sub_bbox[0])) / 2, 108),
        subtitle,
        font=sub_font,
        fill=(123, 166, 201),
    )


def make_cover(
    file_name: str,
    title: str,
    subtitle: str,
    blocks: list[tuple[tuple[int, int, int, int], str, tuple[int, int, int]]],
    top: tuple[int, int, int] = (4, 12, 28),
    bottom: tuple[int, int, int] = (7, 31, 54),
) -> None:
    image = gradient(SIZE, top, bottom)
    draw_grid(image)
    draw = ImageDraw.Draw(image)
    draw_header(draw, title, subtitle)
    label_font = load_font(22)
    for box, label, accent in blocks:
        rounded_block(image, box, label, accent, label_font)
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, SIZE[1] - 3, SIZE[0], SIZE[1]], fill=(79, 210, 221))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / file_name
    image.save(target, "PNG")
    print(f"wrote {target.relative_to(ROOT)}")


def main() -> None:
    blue = (47, 140, 255)
    cyan = (79, 210, 221)
    gold = (255, 209, 102)
    orange = (255, 159, 122)
    green = (81, 214, 169)

    make_cover(
        "campus-3d.png",
        "智慧校园三维总览",
        "CAMPUS 3D OVERVIEW",
        [
            ((40, 180, 320, 500), "楼宇能耗", blue),
            ((960, 180, 1240, 500), "建筑类型", cyan),
            ((360, 175, 920, 645), "三维场景 · 图层 / 模型 / 街景", green),
            ((40, 540, 320, 660), "校园离线瓦片", cyan),
            ((960, 540, 1240, 660), "360° 街景", gold),
        ],
    )
    make_cover(
        "device-monitor.png",
        "实训设备监控",
        "DEVICE MONITORING",
        [
            ((40, 180, 620, 400), "温度趋势", blue),
            ((660, 180, 920, 400), "设备负载", cyan),
            ((960, 180, 1240, 400), "状态图标", orange),
            ((40, 430, 620, 660), "设备列表", blue),
            ((660, 430, 920, 660), "摄像头视频（占位）", gold),
            ((960, 430, 1240, 660), "告警提示", orange),
        ],
        top=(5, 10, 24),
        bottom=(9, 34, 48),
    )
    make_cover(
        "teaching-stats.png",
        "教学数据统计",
        "TEACHING ANALYTICS",
        [
            ((40, 175, 292, 290), "在校学生", cyan),
            ((328, 175, 580, 290), "开设课程", blue),
            ((616, 175, 868, 290), "今日访问", gold),
            ((904, 175, 1240, 290), "资源下载", orange),
            ((40, 320, 400, 500), "年级平均分", blue),
            ((436, 320, 796, 500), "课程完成率", green),
            ((832, 320, 1240, 500), "资源访问趋势（动态）", cyan),
            ((40, 530, 400, 660), "学习方式占比", gold),
            ((436, 530, 796, 660), "作业提交率", green),
            ((832, 530, 1240, 660), "模板备注", blue),
        ],
        top=(6, 10, 30),
        bottom=(24, 16, 46),
    )


if __name__ == "__main__":
    main()
