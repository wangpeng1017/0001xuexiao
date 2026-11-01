"""校园三维类模板：智慧校园三维总览（升级版）、平安校园安防指挥（新增）。"""

from __future__ import annotations

import copy

from template_kit import (
    AMBER, BLUE, CYAN, CYAN_LIGHT, DEEP_BLUE, GREEN, LABEL, ORANGE, PROTOS, PURPLE, RED,
    Canvas, bar_option, gauge_option, line_option, pie_option, scroll_board, template, water_option,
)

ALERT_ROWS = [
    ["10:42", "实验楼 B2", "温度偏高", "一般"], ["10:35", "东环路", "车辆滞留", "提示"],
    ["10:21", "宿舍区 3 号", "烟感触发", "紧急"], ["09:58", "图书馆", "设备离线", "一般"],
    ["09:40", "南门", "人流拥挤", "提示"], ["09:12", "体育馆", "水压偏低", "一般"],
    ["08:57", "食堂", "燃气浓度", "紧急"],
]


def _scene(camera, keep_sets, prefix):
    """复用智慧校园的三维图层（离线瓦片、建筑白模、道路、兴趣点、模型、街景），按图层集名称挑选。"""
    option = copy.deepcopy(PROTOS["scenes"]["campus"])
    option["camera"] = camera
    option["layerSets"] = [s for s in option["layerSets"] if s["name"] in keep_sets]
    if prefix:
        for layer_set in option["layerSets"]:
            layer_set["id"] = f"{prefix}-{layer_set['id']}"
            for layer in layer_set["layers"]:
                layer["id"] = f"{prefix}-{layer['id']}"
    return option


def build_campus():
    c = Canvas("campus")
    c.header("智慧校园三维总览", "QIMING CAMPUS · DIGITAL TWIN")

    for index, (label, value, color, icon) in enumerate([
        ("在校师生（人）", 18620, CYAN_LIGHT, None), ("今日用电（kWh）", 32680, AMBER, None),
        ("在线设备（台）", 1248, CYAN_LIGHT, None), ("空闲教室（间）", 36, GREEN, None),
    ]):
        c.kpi(f"kpi-{index}", 40 + (index % 2) * 226, 112 + (index // 2) * 100, 214, 92, label, value, color=color, icon=icon)

    cx, cy, cw, ch = c.panel("energy", 40, 324, 440, 344, "各楼宇能耗（kWh）")
    c.add("VBarCommon", "energy-bar", cx, cy, cw, ch, bar_option(
        ["楼宇", "能耗"],
        [["教学楼A", 1860], ["实验楼", 2420], ["图书馆", 1680], ["宿舍区", 2140], ["食堂", 1520], ["体育馆", 960]],
        [(CYAN, DEEP_BLUE)], bar_width=20, label=True,
    ))
    cx, cy, cw, ch = c.panel("flow", 40, 684, 440, 356, "校门人流趋势（人次）")
    c.add("VLineCommon", "flow-line", cx, cy, cw, ch, line_option(
        ["时段", "入校", "出校"],
        [["07:00", 1860, 320], ["09:00", 2940, 780], ["11:00", 1240, 1420], ["13:00", 1980, 960],
         ["15:00", 860, 1560], ["17:00", 640, 2680], ["19:00", 520, 1240]],
        [CYAN, AMBER],
    ), dynamic=True)

    c.add("VBorder01", "scene-border", 484, 108, 952, 798, {"dur": 0.5, "colors": [BLUE, CYAN], "backgroundColor": "#00000000"})
    c.add("VScene3D", "scene3d", 500, 124, 920, 766, _scene(
        {"lon": 116.3105, "lat": 39.9905, "height": 1800, "heading": 0, "pitch": -62, "roll": 0},
        {"校园底图", "校园要素", "三维模型", "360 街景"}, prefix="",
    ))
    c.image("stats-frame", 484, 918, 952, 122, "images/border-panel.svg")
    for index, (label, value, icon) in enumerate([
        ("建筑（栋）", 12, "images/icon-server.svg"), ("视频点位（路）", 128, "images/icon-camera.svg"),
        ("环境监测点（个）", 36, "images/icon-sensor.svg"), ("消防设施（处）", 214, "images/icon-alarm.svg"),
    ]):
        x = 506 + index * 232
        c.image(f"stat-{index}-icon", x, 950, 52, 52, icon)
        c.text(f"stat-{index}-label", x + 62, 940, 160, 24, label, size=14, color=LABEL)
        c.number(f"stat-{index}-value", x + 58, 964, 160, 56, value, size=32, color=AMBER)

    cx, cy, cw, ch = c.panel("types", 1440, 112, 440, 322, "建筑类型占比（%）")
    c.add("VPieCommon", "types-pie", cx, cy, cw, ch, pie_option(
        ["类型", "面积占比"], [["教学楼", 34], ["宿舍", 26], ["实验楼", 18], ["食堂", 12], ["体育馆", 10]],
        ["#2fb6e8", ORANGE, "#4f7df3", "#f6c945", PURPLE],
    ))
    cx, cy, cw, ch = c.panel("alerts", 1440, 446, 440, 330, "实时告警")
    c.add("VTableScrollBoard", "alerts-board", cx, cy + 2, cw, ch - 4, scroll_board(
        ["时间", "位置", "类型", "级别"], ALERT_ROWS, [70, 130, 120, 76],
    ))
    cx, cy, cw, ch = c.panel("online", 1440, 788, 440, 252, "设备在线率（%）")
    c.add("VDial", "online-dial", cx, cy, cw, ch, gauge_option(96))

    remarks = (
        "智慧校园三维总览：深色离线底图叠加按高度拉伸、按类型分色的建筑白模、道路与兴趣点矢量，摆放教学楼与景观树模型，"
        "提供图书馆门前 360° 街景；四周展示师生、能耗、人流、建筑占比、实时告警（自动轮播）和设备在线率。"
        "校园与数据均为虚构演示数据。"
    )
    return template("智慧校园三维总览", "campus", remarks, c.export())


def build_security():
    c = Canvas("security")
    c.header("平安校园安防指挥", "CAMPUS SECURITY · COMMAND CENTER", accent="#ffb36b")

    for index, (label, value, color, icon, suffix) in enumerate([
        ("视频点位（路）", 128, CYAN_LIGHT, "images/icon-camera.svg", ""),
        ("今日告警（起）", 23, RED, "images/icon-alarm.svg", ""),
        ("物联传感（个）", 356, CYAN_LIGHT, "images/icon-sensor.svg", ""),
        ("已处置（起）", 21, GREEN, "images/icon-server.svg", ""),
    ]):
        c.kpi(f"kpi-{index}", 40 + (index % 2) * 226, 112 + (index // 2) * 100, 214, 92, label, value,
              color=color, icon=icon, suffix=suffix)

    cx, cy, cw, ch = c.panel("types", 40, 324, 440, 340, "告警类型分布（起）")
    c.add("VBarCrossrange", "types-bar", cx, cy, cw, ch, bar_option(
        ["类型", "本周", "上周"],
        [["周界入侵", 6, 8], ["烟感触发", 9, 7], ["人员聚集", 14, 11], ["车辆违停", 21, 25], ["设备离线", 17, 12]],
        [(RED + "55", RED), (BLUE + "55", BLUE)], bar_width=9, label=False, horizontal=True,
        grid={"left": "22%", "top": "36", "right": "6%", "bottom": "24"},
    ))
    cx, cy, cw, ch = c.panel("trend", 40, 680, 440, 360, "24 小时告警趋势（起）")
    c.add("VLineCommon", "trend-line", cx, cy, cw, ch, line_option(
        ["时段", "告警", "处置"],
        [["00时", 2, 2], ["03时", 1, 1], ["06时", 3, 2], ["09时", 7, 6], ["12时", 5, 5],
         ["15时", 6, 5], ["18时", 8, 7], ["21时", 4, 4]],
        [RED, GREEN],
    ))

    c.add("VBorder08", "scene-border", 484, 108, 952, 798, {"colors": ["#7a3b1d", "#ffb36b"], "dur": 4})
    c.add("VScene3D", "scene3d", 498, 122, 924, 770, _scene(
        {"lon": 116.31868, "lat": 39.98772, "height": 1650, "heading": -28, "pitch": -48, "roll": 0},
        {"校园底图", "校园要素"}, prefix="sec",
    ))
    c.image("zones-frame", 484, 918, 952, 122, "images/border-panel.svg")
    c.text("zones-title", 504, 930, 100, 96, "区域\n告警\n排名", size=14, color="#ffb36b", bold=True)
    c.add("VCapsuleChart", "zones-capsule", 560, 934, 860, 96, {
        "dataset": {"dimensions": ["name", "value"], "source": [
            {"name": "宿舍区", "value": 7}, {"name": "教学区", "value": 5}, {"name": "运动区", "value": 4},
            {"name": "生活区", "value": 4}, {"name": "校门", "value": 3}]},
        "colors": [RED, ORANGE, AMBER, CYAN, BLUE], "unit": "", "itemHeight": 8, "valueFontSize": 13,
        "paddingLeft": 70, "paddingRight": 50, "showValue": True,
    })

    cx, cy, cw, ch = c.panel("alerts", 1440, 112, 440, 420, "实时告警")
    c.add("VTableScrollBoard", "alerts-board", cx, cy + 2, cw, ch - 4, merge_board(scroll_board(
        ["时间", "位置", "类型", "级别"], ALERT_ROWS + [["08:31", "西门", "周界入侵", "紧急"]], [70, 130, 120, 76], row_num=8,
    )))
    cx, cy, cw, ch = c.panel("dispose", 1440, 544, 214, 240, "处置率")
    c.add("VDial", "dispose-dial", cx, cy, cw, ch, gauge_option(91, color=GREEN))
    cx, cy, cw, ch = c.panel("patrol", 1666, 544, 214, 240, "巡更完成")
    c.add("VWaterPolo", "patrol-water", cx + 10, cy, cw - 20, ch, water_option(0.86))
    cx, cy, cw, ch = c.panel("source", 1440, 796, 440, 244, "告警来源占比（%）")
    c.add("VPieCommon", "source-pie", cx, cy, cw, ch, pie_option(
        ["来源", "占比"], [["视频分析", 46], ["烟感", 18], ["门禁", 14], ["电子围栏", 12], ["人工上报", 10]],
        [CYAN, RED, AMBER, PURPLE, GREEN], radius=("38%", "62%"), center=("30%", "48%"),
    ) | {"legend": {"show": True, "x": "right", "y": "center", "orient": "vertical",
                    "textStyle": {"color": LABEL, "fontSize": 12}, "itemHeight": 8, "itemWidth": 8}})

    remarks = (
        "平安校园安防指挥：中央三维校园（离线底图、建筑白模、道路与监控/消防/环境监测点位），"
        "四周展示点位与告警指标、告警类型与 24 小时趋势、实时告警轮播、处置率、巡更完成率、告警来源和区域告警排名。"
        "校园与数据均为虚构演示数据。"
    )
    return template("平安校园安防指挥", "device", remarks, c.export(), background="images/bg-tech-aurora.jpg")


def merge_board(option):
    """告警轮播：紧急级别行加深底色，突出显示。"""
    return option | {"oddRowBGC": "#1a1020cc", "evenRowBGC": "#0a1a30aa", "headerBGC": "#5a2a1acc"}
