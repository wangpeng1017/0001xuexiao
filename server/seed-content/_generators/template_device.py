"""实训设备监控（升级版）：设备状态指标、温度趋势、负载与利用率、摄像头视频、设备列表、告警轮播。"""

from __future__ import annotations

from template_kit import (
    AMBER, BLUE, CYAN, CYAN_LIGHT, GREEN, LABEL, ORANGE, PURPLE, RED,
    Canvas, bar_option, gauge_option, line_option, pie_option, scroll_board, template, water_option,
)

DEVICES = [
    ("数控车床", "机加工实训室", "运行", "68%", "42.3℃"),
    ("工业机器人", "智能制造实训室", "运行", "74%", "38.6℃"),
    ("3D 打印机", "创客空间", "待机", "0%", "26.1℃"),
    ("PLC 实训台", "电气实训室", "运行", "52%", "35.2℃"),
    ("激光切割机", "机加工实训室", "告警", "91%", "56.8℃"),
    ("服务器机柜", "数据中心", "运行", "63%", "29.4℃"),
    ("视觉检测工位", "智能制造实训室", "离线", "-", "-"),
]


def build():
    c = Canvas("device")
    c.header("实训设备监控", "TRAINING EQUIPMENT · MONITORING")

    kpis = [
        ("设备总数（台）", 248, CYAN_LIGHT, "images/icon-server.svg"),
        ("运行中（台）", 186, GREEN, "images/icon-sensor.svg"),
        ("摄像头（路）", 32, CYAN_LIGHT, "images/icon-camera.svg"),
        ("今日告警（条）", 7, RED, "images/icon-alarm.svg"),
        ("综合利用率（%）", 75.0, AMBER, None),
    ]
    for index, (label, value, color, icon) in enumerate(kpis):
        c.kpi(f"kpi-{index}", 40 + index * 372, 112, 356, 96, label, value, color=color, icon=icon,
              precision=1 if isinstance(value, float) else 0)

    # 左列：温度趋势 + 负载仪表 + 利用率水球
    cx, cy, cw, ch = c.panel("temp", 40, 224, 560, 400, "车间温度趋势（℃）")
    c.add("VLineCommon", "temp-line", cx, cy, cw, ch, line_option(
        ["时间", "机加工", "电气", "智能制造"],
        [["08:00", 24.2, 23.1, 22.8], ["09:00", 27.5, 24.6, 24.1], ["10:00", 31.8, 26.2, 25.9],
         ["11:00", 34.6, 27.4, 27.2], ["12:00", 30.1, 26.0, 26.4], ["13:00", 33.2, 27.9, 28.0],
         ["14:00", 36.4, 28.6, 28.8], ["15:00", 35.1, 28.1, 27.6]],
        [ORANGE, CYAN, PURPLE], area=0.04,
    ))
    cx, cy, cw, ch = c.panel("load", 40, 640, 272, 400, "设备负载")
    c.add("VDial", "load-dial", cx, cy + 20, cw, ch - 40, gauge_option(68, color=CYAN))
    cx, cy, cw, ch = c.panel("usage", 328, 640, 272, 400, "工位利用率")
    c.add("VWaterPolo", "usage-water", cx + 6, cy + 30, cw - 12, ch - 60, water_option(0.75))

    # 中间：摄像头视频 + 设备列表
    c.add("VBorder08", "video-border", 616, 224, 688, 400, {"colors": ["#235fa7", CYAN], "dur": 3})
    c.text("video-title", 640, 236, 400, 28, "▍智能制造实训室 · 摄像头 01", size=15, color=CYAN_LIGHT, bold=True)
    c.add("VRtspVideo", "rtsp-video", 632, 272, 656, 340, {"rtspUrl": "", "streamId": "", "autoplay": True, "muted": True, "fit": "contain"})
    cx, cy, cw, ch = c.panel("devices", 616, 640, 688, 400, "设备列表")
    c.add("VTablesBasic", "device-table", cx, cy, cw, ch, {
        "dataset": {
            "dimensions": [{"title": t, "key": k} for t, k in
                           [("设备", "name"), ("位置", "place"), ("状态", "state"), ("负载", "load"), ("温度", "temp")]],
            "source": [{"key": i, "name": d[0], "place": d[1], "state": d[2], "load": d[3], "temp": d[4]}
                       for i, d in enumerate(DEVICES)],
        },
        "pagination": {"page": 1, "pageSize": 5},
        "align": "center",
        "style": {"border": "on", "singleColumn": "off", "singleLine": "off", "bottomBordered": "on", "striped": "on",
                  "fontSize": 13, "borderWidth": 0, "borderColor": "black", "borderStyle": "solid"},
        "inputShow": "none",
    })

    # 右列：设备状态 + 告警轮播 + 能耗
    cx, cy, cw, ch = c.panel("state", 1320, 224, 560, 300, "设备状态分布（台）")
    c.add("VPieCommon", "state-pie", cx, cy, cw, ch, pie_option(
        ["状态", "数量"], [["运行", 186], ["待机", 38], ["告警", 7], ["离线", 17]],
        [GREEN, BLUE, RED, "#5b6b84"], radius=("40%", "66%"), center=("32%", "50%"),
    ) | {"legend": {"show": True, "x": "right", "y": "center", "orient": "vertical",
                    "textStyle": {"color": LABEL, "fontSize": 13}, "itemHeight": 10, "itemWidth": 10}})
    cx, cy, cw, ch = c.panel("alarms", 1320, 540, 560, 250, "设备告警")
    c.add("VTableScrollBoard", "alarm-board", cx, cy + 2, cw, ch - 4, scroll_board(
        ["时间", "设备", "告警内容"],
        [["10:42", "激光切割机 L600", "主轴温度过高"], ["10:16", "视觉检测工位 V2", "通讯中断"],
         ["09:58", "数控车床 CK6140", "刀具磨损预警"], ["09:31", "服务器机柜 R03", "风扇转速异常"],
         ["09:05", "工业机器人 IRB120", "关节扭矩偏高"], ["08:47", "PLC 实训台", "急停按钮触发"]],
        [70, 180, 266], row_num=4,
    ))
    cx, cy, cw, ch = c.panel("power", 1320, 806, 560, 234, "各实训室用电（kWh）")
    c.add("VBarCommon", "power-bar", cx, cy, cw, ch, bar_option(
        ["实训室", "用电"],
        [["机加工", 820], ["智能制造", 640], ["电气", 410], ["数据中心", 960], ["创客空间", 230]],
        [(AMBER, ORANGE)], bar_width=18, label=True,
    ))

    remarks = (
        "实训设备监控：展示设备总数、运行、摄像头、告警与利用率指标，车间温度趋势、设备负载、工位利用率、"
        "摄像头视频、设备列表、设备状态分布、设备告警轮播和实训室用电。摄像头 RTSP 地址已留空，"
        "配置 RTSP 地址并连接后即可播放。设备数据为虚构演示数据。"
    )
    return template("实训设备监控", "device", remarks, c.export(), background="images/bg-tech-wave.jpg")

