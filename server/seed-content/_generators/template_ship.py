"""船舶点云数字孪生：三维点云铺满整块画布，图表沿上下左右四边排布，中间留给鼠标操作三维。"""

from __future__ import annotations

from template_kit import (
    AMBER, BLUE, CYAN, CYAN_LIGHT, DEEP_BLUE, GREEN, LABEL, ORANGE, PURPLE, RED, TEXT,
    Canvas, bar_option, line_option, pie_option, radar_option, scroll_board, template,
)

SHIP_ANCHOR = (116.309749, 39.999893)  # 点云 tileset 根变换的落点（局部坐标转换时的锚点）

SCENE_OPTION = {
    "sceneMode": "3D",
    "camera": {"lon": 116.309749, "lat": 39.999380, "height": 34, "heading": 0, "pitch": -30, "roll": 0},
    "baseLayer": "none",
    "layerSets": [{
        "id": "ship-set",
        "name": "船舶点云",
        "visible": True,
        "layers": [{
            "id": "ship-pointcloud",
            "name": "船舶点云（1378 万点）",
            "type": "model",
            "source": {
                "from": "datafile", "refId": "", "url": "{{datafile:datafiles/ship-pointcloud}}",
                "format": "3dtiles", "position": {"lon": 0, "lat": 0, "height": 0},
                "rotation": {"heading": 0, "pitch": 0, "roll": 0}, "scale": 1,
            },
            "visible": True,
            "opacity": 1,
            "style": {"fill": "#51d6a9", "stroke": "#0b3f56", "strokeWidth": 3, "pointColor": "#ffd166",
                      "pointSize": 2, "colorBy": "rgb"},
        }],
    }],
}

PANEL_FILL = "#030c1ccc"


def _left(c: Canvas):
    x, w = 24, 410
    c.box("left-kpi-fill", x, 112, w, 196, fill=PANEL_FILL)
    c.kpi("kpi-points", x, 112, 205, 98, "点云数量（万点）", 1378, color=CYAN_LIGHT)
    c.kpi("kpi-length", x + 205, 112, 205, 98, "扫描长度（m）", 33.2, precision=1, color=AMBER)
    c.kpi("kpi-width", x, 210, 205, 98, "扫描宽度（m）", 20.7, precision=1, color=AMBER)
    c.kpi("kpi-height", x + 205, 210, 205, 98, "扫描高度（m）", 8.6, precision=1, color=AMBER)

    cx, cy, cw, ch = c.panel("density", x, 320, w, 350, "分区点云密度（点/m²）", fill=PANEL_FILL)
    c.add("VBarCommon", "density-bar", cx, cy, cw, ch, bar_option(
        ["区段", "密度"],
        [["艏部", 1820], ["艏楼", 2360], ["舯前", 2980], ["舯部", 3420], ["舯后", 2710], ["艉楼", 2140], ["艉部", 1650]],
        [(CYAN, DEEP_BLUE)], bar_width=16, label=True,
    ))

    cx, cy, cw, ch = c.panel("progress", x, 682, w, 374, "各扫描站配准误差（mm）", fill=PANEL_FILL)
    line = c.add("VLineCommon", "progress-line", cx, cy, cw, ch, line_option(
        ["站点", "配准误差", "允许限值"],
        [["S1", 3.2, 4.0], ["S2", 2.6, 4.0], ["S3", 2.9, 4.0], ["S4", 2.1, 4.0], ["S5", 1.8, 4.0],
         ["S6", 2.4, 4.0], ["S7", 1.6, 4.0], ["S8", 1.9, 4.0]],
        [CYAN, RED], area=0.12,
    ))
    limit = line["option"]["series"][1]
    limit["areaStyle"] = {"opacity": 0}
    limit["lineStyle"]["type"] = "dashed"
    limit["symbolSize"] = 0


def _right(c: Canvas):
    x, w = 1486, 410
    cx, cy, cw, ch = c.panel("radar", x, 112, w, 330, "船体结构检测评分", fill=PANEL_FILL)
    c.add("VRadar", "radar-chart", cx, cy, cw, ch, radar_option(
        [(n, 100) for n in ["外板平整", "甲板变形", "舱口完整", "上层建筑", "附属设施", "涂层状况"]],
        [("本次扫描", [92, 86, 95, 88, 81, 76], CYAN), ("上次扫描", [88, 82, 93, 85, 84, 70], AMBER)],
    ))

    cx, cy, cw, ch = c.panel("parts", x, 454, w, 290, "构件点数占比（%）", fill=PANEL_FILL)
    c.add("VPieCommon", "parts-pie", cx, cy, cw, ch, pie_option(
        ["构件", "占比"],
        [["船体外板", 38], ["甲板", 24], ["上层建筑", 18], ["舱口围", 11], ["附属设施", 9]],
        [CYAN, BLUE, AMBER, PURPLE, GREEN], center=("50%", "42%"),
    ))

    cx, cy, cw, ch = c.panel("records", x, 756, w, 300, "检测记录", fill=PANEL_FILL)
    c.add("VTableScrollBoard", "records-board", cx, cy + 2, cw, ch - 4, scroll_board(
        ["时间", "部位", "结果"],
        [["10:42", "左舷外板", "合格"], ["10:31", "主甲板", "轻微变形"], ["10:18", "艏楼", "合格"],
         ["10:05", "舱口围", "合格"], ["09:52", "右舷外板", "涂层脱落"], ["09:40", "艉楼", "合格"],
         ["09:26", "桅杆", "合格"]],
        [90, 160, 130], row_num=5,
    ))


def _top(c: Canvas):
    c.header("船舶点云数字孪生", "SHIP POINT CLOUD · DIGITAL TWIN", corners=False)
    items = [("扫描站点", "8 站", CYAN_LIGHT), ("平均配准误差", "2.3 mm", AMBER), ("检测项", "36 项", CYAN_LIGHT), ("待复核", "2 项", RED)]
    for index, (label, value, color) in enumerate(items):
        x = 548 + index * 212
        c.box(f"top-stat-{index}-fill", x, 112, 196, 44, fill="#030c1c99")
        c.text(f"top-stat-{index}-label", x, 114, 196, 18, label, size=12, color=LABEL, align="center")
        c.text(f"top-stat-{index}-value", x, 132, 196, 22, value, size=18, color=color, align="center", bold=True)


def _bottom(c: Canvas):
    x, y, w, h = 456, 862, 1008, 194
    c.text("hint", 700, y - 34, 520, 24, "滚轮或右键拖动缩放 · 左键拖动平移 · 中键或 Ctrl+左键拖动旋转", size=13, color=LABEL, align="center",
           bg="#030c1c99")
    cx, cy, cw, ch = c.panel("profile", x, y, w, h, "沿船长方向截面尺寸（m）", fill=PANEL_FILL)
    rows = [[f"{d}m", h_, b] for d, h_, b in [
        (0, 3.1, 6.2), (3, 5.2, 11.4), (6, 6.4, 15.1), (9, 7.1, 17.8), (12, 7.8, 19.6), (15, 8.4, 20.5),
        (18, 8.6, 20.7), (21, 8.2, 20.6), (24, 7.5, 20.1), (27, 6.6, 18.9), (30, 5.1, 16.2), (33, 3.4, 12.8)]]
    c.add("VBarLine", "profile-chart", cx, cy - 6, cw, ch + 6, {
        "legend": {"show": True, "x": "right", "y": "top", "textStyle": {"color": LABEL, "fontSize": 12},
                   "itemHeight": 8, "itemWidth": 12},
        "grid": {"left": "5%", "top": "30", "right": "5%", "bottom": "24"},
        "xAxis": {"axisLabel": {"color": LABEL, "fontSize": 11}, "axisTick": {"show": False},
                  "axisLine": {"lineStyle": {"color": "#2b5a80"}}},
        "yAxis": {"axisLabel": {"color": LABEL, "fontSize": 11}, "axisLine": {"show": False}, "axisTick": {"show": False},
                  "splitLine": {"show": True, "lineStyle": {"color": "#16324f", "type": "dashed"}}},
        "dataset": {"dimensions": ["位置", "截面高度", "截面宽度"],
                    "source": [dict(zip(["位置", "截面高度", "截面宽度"], row)) for row in rows]},
        "series": [
            {"type": "bar", "barWidth": 18, "label": {"show": False},
             "itemStyle": {"color": {"type": "linear", "x": 0, "y": 0, "x2": 0, "y2": 1,
                                     "colorStops": [{"offset": 0, "color": CYAN}, {"offset": 1, "color": "#0d3a6a"}]},
                           "borderRadius": 2}},
            {"type": "line", "symbol": "circle", "smooth": True, "symbolSize": 5, "label": {"show": False},
             "itemStyle": {"color": ORANGE, "borderWidth": 1}, "lineStyle": {"type": "solid", "width": 2.5, "color": ORANGE}},
        ],
    })


def build():
    c = Canvas("ship")
    # 三维场景最先添加（zIndex 最低）并铺满整块画布；四周组件只覆盖边缘，中间区域直接操作三维
    c.add("VScene3D", "scene3d", 0, 0, 1920, 1080, SCENE_OPTION)
    _top(c)
    _left(c)
    _right(c)
    _bottom(c)
    remarks = (
        "船舶点云数字孪生：预置船舶点云（3D Tiles，1378 万点，带真实颜色）铺满整块画布作为三维底图，"
        "滚轮或右键拖动缩放、左键拖动平移、中键或 Ctrl+左键拖动旋转；四周排布点云统计、分区密度、配准误差、结构检测评分、"
        "构件占比、检测记录与截面高度图表。点数和扫描尺寸为该点云的真实值，其余检测数据为虚构演示数据。"
    )
    return template("船舶点云数字孪生", "other", remarks, c.export())
