"""数据统计类模板：教学数据统计（升级版）、校园能耗管理（新增）。"""

from __future__ import annotations

from template_kit import (
    AMBER, BLUE, CYAN, CYAN_LIGHT, DEEP_BLUE, GREEN, LABEL, ORANGE, PURPLE, RED,
    Canvas, bar_option, line_option, radar_option, pie_option, scroll_board, template, water_option,
)


def build_teaching():
    c = Canvas("teaching")
    c.header("教学数据统计", "TEACHING · DATA ANALYTICS")

    for index, (label, value, color) in enumerate([
        ("在校学生（人）", 12680, CYAN_LIGHT), ("开设课程（门）", 486, CYAN_LIGHT), ("专任教师（人）", 862, CYAN_LIGHT),
        ("今日访问（次）", 3241, AMBER), ("资源下载（次）", 8642, AMBER), ("作业提交率（%）", 94.6, GREEN),
    ]):
        c.kpi(f"kpi-{index}", 40 + index * 308, 112, 296, 96, label, value, color=color,
              precision=1 if isinstance(value, float) else 0)

    cx, cy, cw, ch = c.panel("grade", 40, 224, 600, 400, "各年级平均分")
    c.add("VBarCommon", "grade-bar", cx, cy, cw, ch, bar_option(
        ["年级", "语文", "数学", "英语"],
        [["高一", 86, 82, 84], ["高二", 84, 85, 82], ["高三", 88, 87, 86]],
        [(CYAN, DEEP_BLUE), (AMBER, ORANGE), (PURPLE, "#5b3fc4")], bar_width=16,
    ))
    cx, cy, cw, ch = c.panel("mode", 40, 640, 600, 400, "学习方式占比（%）")
    c.add("VPieCommon", "mode-pie", cx, cy, cw, ch, pie_option(
        ["方式", "占比"], [["课堂教学", 42], ["线上课程", 26], ["实训实践", 18], ["自主学习", 14]],
        [CYAN, BLUE, AMBER, PURPLE],
    ))

    cx, cy, cw, ch = c.panel("visits", 660, 224, 600, 400, "资源访问趋势（动态接口）")
    c.add("VLineCommon", "visits-line", cx, cy, cw, ch, line_option(
        ["日期", "访问", "下载"],
        [["周一", 2860, 1320], ["周二", 3120, 1480], ["周三", 2980, 1610], ["周四", 3410, 1720],
         ["周五", 3241, 1590], ["周六", 1820, 860], ["周日", 1560, 720]],
        [CYAN, AMBER],
    ), dynamic=True)
    cx, cy, cw, ch = c.panel("complete", 660, 640, 600, 400, "各部门课程完成率（%）")
    c.add("VBarCommon", "complete-bar", cx, cy, cw, ch, bar_option(
        ["部门", "完成率"],
        [["信息工程", 96], ["机电工程", 92], ["经济管理", 89], ["艺术设计", 94], ["基础部", 98]],
        [(GREEN, "#0f6f6a")], bar_width=24, label=True,
    ))

    cx, cy, cw, ch = c.panel("ability", 1280, 224, 600, 400, "学科核心素养")
    c.add("VRadar", "ability-radar", cx, cy, cw, ch, radar_option(
        [("知识理解", 100), ("实践应用", 100), ("创新思维", 100), ("协作沟通", 100), ("信息素养", 100), ("自主学习", 100)],
        [("本学期", [88, 82, 76, 85, 90, 79], CYAN), ("上学期", [84, 77, 70, 82, 86, 74], AMBER)],
    ))
    cx, cy, cw, ch = c.panel("rank", 1280, 640, 600, 400, "课程热度排行（选课人数）")
    c.add("VTableList", "rank-list", cx, cy + 6, cw, ch - 12, {
        "dataset": [{"name": n, "value": v} for n, v in [
            ("人工智能导论", 1286), ("Python 程序设计", 1142), ("工业机器人应用", 986), ("数据可视化", 874),
            ("电子商务实务", 762), ("三维建模", 698), ("网络安全基础", 645), ("数字媒体艺术", 588)]],
        "rowNum": 6, "waitTime": 2, "unit": "人", "sort": True, "color": "#1d9bd1",
        "textColor": "#cfeeffff", "borderColor": "#1d9bd180", "carousel": "single",
        "indexFontSize": 13, "leftFontSize": 14, "rightFontSize": 14,
    })

    remarks = (
        "教学数据统计：展示学生、课程、教师、访问、下载和作业提交率指标，以及年级成绩、学习方式、"
        "部门课程完成率、学科核心素养雷达和课程热度排行。资源访问趋势图已设置为动态请求，"
        "绑定第三方数据后在此粘贴接口地址（requestUrl 当前为空）。数据为虚构演示数据。"
    )
    return template("教学数据统计", "data", remarks, c.export(), background="images/bg-tech-aurora.jpg")


def build_energy():
    c = Canvas("energy")
    c.header("校园能耗管理", "CAMPUS ENERGY · MANAGEMENT", accent="#8ff0a4")

    for index, (label, value, color, suffix) in enumerate([
        ("今日用电（kWh）", 32680, AMBER, ""), ("今日用水（t）", 1286, CYAN_LIGHT, ""),
        ("今日燃气（m³）", 846, ORANGE, ""), ("光伏发电（kWh）", 4120, GREEN, ""),
        ("碳排放（tCO₂）", 21.6, CYAN_LIGHT, ""),
    ]):
        c.kpi(f"kpi-{index}", 40 + index * 372, 112, 356, 96, label, value, color=color, suffix=suffix,
              precision=1 if isinstance(value, float) else 0)

    cx, cy, cw, ch = c.panel("monthly", 40, 224, 900, 400, "月度用电量与去年同期（MWh）")
    rows = [[month, value, round(value / (1 + yoy / 100))] for month, value, yoy in [
        ["1月", 1020, -3.2], ["2月", 760, -5.1], ["3月", 980, -2.4], ["4月", 940, -4.0], ["5月", 1010, -1.6],
        ["6月", 1180, 2.1], ["7月", 860, -6.3], ["8月", 820, -4.8], ["9月", 1090, -2.9], ["10月", 1040, -3.5]]]
    c.add("VBarLine", "monthly-chart", cx, cy, cw, ch, {
        "legend": {"show": True, "x": "right", "y": "top", "textStyle": {"color": LABEL, "fontSize": 12},
                   "itemHeight": 8, "itemWidth": 12},
        "grid": {"left": "6%", "top": "40", "right": "4%", "bottom": "28"},
        "xAxis": {"axisLabel": {"color": LABEL, "fontSize": 11}, "axisTick": {"show": False},
                  "axisLine": {"lineStyle": {"color": "#2b5a80"}}},
        "yAxis": {"axisLabel": {"color": LABEL, "fontSize": 11}, "axisLine": {"show": False}, "axisTick": {"show": False},
                  "splitLine": {"show": True, "lineStyle": {"color": "#16324f", "type": "dashed"}}},
        "dataset": {"dimensions": ["月份", "今年", "去年同期"],
                    "source": [dict(zip(["月份", "今年", "去年同期"], row)) for row in rows]},
        "series": [
            {"type": "bar", "barWidth": 22, "label": {"show": False},
             "itemStyle": {"color": {"type": "linear", "x": 0, "y": 0, "x2": 0, "y2": 1,
                                     "colorStops": [{"offset": 0, "color": "#8ff0a4"}, {"offset": 1, "color": "#0f6f6a"}]},
                           "borderRadius": 3}},
            {"type": "line", "symbol": "circle", "smooth": True, "symbolSize": 6, "label": {"show": False},
             "itemStyle": {"color": AMBER, "borderWidth": 1}, "lineStyle": {"type": "solid", "width": 2.5, "color": AMBER}},
        ],
    })
    cx, cy, cw, ch = c.panel("load", 40, 640, 900, 400, "24 小时负荷曲线（kW）")
    c.add("VLineCommon", "load-line", cx, cy, cw, ch, line_option(
        ["时刻", "今日", "昨日"],
        [[f"{h:02d}:00", t, y] for h, t, y in [
            (0, 820, 860), (2, 760, 790), (4, 740, 770), (6, 980, 1010), (8, 2360, 2480), (10, 2980, 3120),
            (12, 2640, 2720), (14, 3020, 3160), (16, 2860, 2990), (18, 2240, 2310), (20, 1860, 1920), (22, 1120, 1180)]],
        ["#8ff0a4", BLUE], area=0.15,
    ))

    cx, cy, cw, ch = c.panel("split", 956, 224, 440, 400, "分项能耗占比（%）")
    c.add("VPieCommon", "split-pie", cx, cy, cw, ch, pie_option(
        ["分项", "占比"], [["空调", 38], ["照明", 21], ["动力", 17], ["实训设备", 15], ["其他", 9]],
        ["#8ff0a4", CYAN, AMBER, PURPLE, "#5b6b84"],
    ))
    cx, cy, cw, ch = c.panel("target", 956, 640, 440, 400, "年度节能目标完成")
    c.add("VWaterPolo", "target-water", cx + 70, cy + 20, cw - 140, ch - 50, water_option(0.82, top="#8ff0a4", bottom="#0f6f6a"))

    cx, cy, cw, ch = c.panel("rank", 1412, 224, 468, 400, "楼宇能耗排名（kWh）")
    c.add("VCapsuleChart", "rank-capsule", cx, cy + 4, cw, ch - 8, {
        "dataset": {"dimensions": ["name", "value"], "source": [
            {"name": "实验楼", "value": 2420}, {"name": "宿舍区", "value": 2140}, {"name": "教学楼A", "value": 1860},
            {"name": "图书馆", "value": 1680}, {"name": "食堂", "value": 1520}, {"name": "体育馆", "value": 960}]},
        "colors": [RED, ORANGE, AMBER, "#8ff0a4", CYAN, BLUE], "unit": "", "itemHeight": 10, "valueFontSize": 13,
        "paddingLeft": 70, "paddingRight": 60, "showValue": True,
    })
    cx, cy, cw, ch = c.panel("abnormal", 1412, 640, 468, 400, "异常用能告警")
    c.add("VTableScrollBoard", "abnormal-board", cx, cy + 2, cw, ch - 4, scroll_board(
        ["时间", "位置", "异常"],
        [["10:40", "实验楼 3F", "夜间空调未关"], ["09:52", "宿舍区 5 号", "用水量突增"], ["09:20", "图书馆", "照明超时"],
         ["08:46", "食堂", "燃气流量偏高"], ["08:10", "体育馆", "水泵空转"], ["07:35", "教学楼A", "待机功耗偏高"],
         ["06:58", "数据中心", "PUE 超阈值"]],
        [70, 150, 200], row_num=7,
    ))

    remarks = (
        "校园能耗管理：展示用电、用水、燃气、光伏发电和碳排放指标，月度用电量与去年同期对比、24 小时负荷曲线、"
        "分项能耗占比、年度节能目标完成率、楼宇能耗排名和异常用能告警轮播。数据为虚构演示数据。"
    )
    return template("校园能耗管理", "data", remarks, c.export(), background="images/bg-tech-wave.jpg")
