"""场景模板组件工具：按组件原型（template_protos.json）拼出 GoView 组件 JSON。

原型来自前端各组件 config.ts 的默认值（由浏览器导出），模板只在原型上覆盖布局、数据和配色，
保证生成的组件结构与编辑器新建出来的一致。
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

PROTOS = json.loads((Path(__file__).resolve().parent / "template_protos.json").read_text(encoding="utf-8"))

# ---- 统一视觉语言 ----
CYAN = "#4fd2dd"
CYAN_LIGHT = "#7fe7ff"
BLUE = "#2f8cff"
DEEP_BLUE = "#1d6fd1"
AMBER = "#ffbf47"
ORANGE = "#f59a4a"
RED = "#ff5d5d"
GREEN = "#2ee6b8"
PURPLE = "#9b7bf0"
LABEL = "#8fb8d8"
TEXT = "#cfeeff"
GRID_LINE = "#16324f"
PANEL_FILL = "#04122ab3"
TITLE_FILL = "#0d3a6a80"
PALETTE = [CYAN, BLUE, AMBER, PURPLE, GREEN, ORANGE]

_BASE = {
    "isGroup": False,
    "styles": {
        "filterShow": False, "hueRotate": 0, "saturate": 1, "contrast": 1, "brightness": 1,
        "opacity": 1, "rotateZ": 0, "rotateX": 0, "rotateY": 0, "skewX": 0, "skewY": 0,
        "blendMode": "normal", "animations": [],
    },
    "preview": {"overFlowHidden": False},
    "status": {"lock": False, "hide": False},
    "request": {
        "requestDataType": 0, "requestHttpType": "get", "requestUrl": "",
        "requestIntervalUnit": "second", "requestContentType": 0, "requestParamsBodyType": "none",
        "requestSQLContent": {"sql": "select * from  where"},
        "requestParams": {
            "Body": {"form-data": {}, "x-www-form-urlencoded": {}, "json": "", "xml": ""},
            "Header": {}, "Params": {},
        },
    },
    "events": {"baseEvent": {}, "advancedEvents": {}, "interactEvents": []},
}


def merge(base, patch):
    """深合并：字典递归合并，列表与标量整体替换。返回新对象，不修改入参。"""
    if not isinstance(base, dict) or not isinstance(patch, dict):
        return copy.deepcopy(patch)
    result = copy.deepcopy(base)
    for key, value in patch.items():
        result[key] = merge(result[key], value) if key in result else copy.deepcopy(value)
    return result


class Canvas:
    """按添加顺序分配 zIndex（越晚越靠上），组件 id 以模板前缀开头。"""

    def __init__(self, prefix: str):
        self.prefix = prefix
        self.items: list[dict] = []

    def add(self, chart_key, name, x, y, w, h, option=None, dynamic=False):
        proto = PROTOS["components"][chart_key]
        component = copy.deepcopy(_BASE)
        component.update({
            "id": f"{self.prefix}-{name}",
            "key": proto["key"],
            "chartConfig": copy.deepcopy(proto["chartConfig"]),
            "option": merge(proto["option"], option or {}),
            "attr": {"x": x, "y": y, "w": w, "h": h, "offsetX": 0, "offsetY": 0, "zIndex": len(self.items)},
        })
        if dynamic:
            component["request"]["requestDataType"] = 1
        self.items.append(component)
        return component

    # ---- 基础元素 ----
    def text(self, name, x, y, w, h, value, size=16, color=TEXT, align="left", bold=False, spacing=0, bg="#00000000", pad=0):
        return self.add("VTextCommon", name, x, y, w, h, {
            "dataset": value, "fontSize": size, "fontColor": color, "textAlign": align,
            "fontWeight": "bold" if bold else "normal", "letterSpacing": spacing,
            "backgroundColor": bg, "paddingX": pad, "borderRadius": 2,
        })

    def box(self, name, x, y, w, h, fill=PANEL_FILL, radius=4):
        """半透明底板：空文字组件 + 背景色，叠在三维/背景图上保证图表可读。"""
        return self.add("VTextCommon", name, x, y, w, h, {
            "dataset": "", "backgroundColor": fill, "borderRadius": radius, "borderWidth": 0,
        })

    def image(self, name, x, y, w, h, material):
        return self.add("VImage", name, x, y, w, h, {"dataset": f"{{{{material:{material}}}}}", "fit": "fill"})

    def number(self, name, x, y, w, h, value, size=34, color=CYAN_LIGHT, suffix="", precision=0):
        return self.add("VNumber", name, x, y, w, h, {
            "dataset": value, "numberSize": size, "numberColor": color, "precision": precision,
            "suffixText": suffix, "suffixColor": LABEL, "showSeparator": True,
        })

    # ---- 组合件 ----
    def header(self, title, subtitle, accent=CYAN_LIGHT, corners=True):
        """顶部标题：可选四角边框 + 左右装饰翼 + 渐变大标题 + 英文副标题 + 流光装饰线 + 右侧时间。
        有四角边框时左上、右上让出边框线条；无边框（如三维铺满画布）时左上显示平台名称。"""
        if corners:
            self.image("corners", 0, 0, 1920, 1080, "images/border-corners.svg")
        else:
            self.text("platform", 30, 30, 360, 30, "多源数据融合可视化平台", size=16, color=LABEL, spacing=2)
        self.image("title-left", 190, 22, 460, 50, "images/title-decor-left.svg")
        self.image("title-right", 1270, 22, 460, 50, "images/title-decor-right.svg")
        self.add("VTextGradient", "title", 660, 12, 600, 56, {
            "dataset": title, "size": 38, "gradient": {"from": "#e8fdffff", "to": accent + "ff", "deg": 90},
        })
        self.text("subtitle", 660, 66, 600, 22, subtitle, size=12, color=LABEL, align="center", spacing=6)
        self.add("VDecorates05", "title-flow", 760, 88, 400, 14, {"colors": [CYAN, CYAN + "4d"], "dur": 3})
        self.add("VTimeCommon", "clock", 1560, 54 if corners else 24, 300, 40, {
            "timeSize": 18, "timeLineHeight": 40, "timeColor": TEXT, "colorShadow": "#0075ff", "blurShadow": 6,
        })

    def panel(self, name, x, y, w, h, title, fill=None):
        """面板：可选底板 + 科技边框 + 标题条，返回内容区 (x, y, w, h)。"""
        if fill:
            self.box(f"{name}-fill", x + 4, y + 4, w - 8, h - 8, fill=fill)
        self.image(f"{name}-frame", x, y, w, h, "images/border-panel.svg")
        self.text(f"{name}-title", x + 18, y + 12, w - 36, 30, f"▍{title}", size=16, color=CYAN_LIGHT,
                  bold=True, bg=TITLE_FILL, pad=10)
        return x + 12, y + 48, w - 24, h - 58

    def kpi(self, name, x, y, w, h, label, value, suffix="", color=CYAN_LIGHT, precision=0, icon=None):
        """指标卡：边框 + 标签 + 滚动数字，可带左侧图标。"""
        self.image(f"{name}-frame", x, y, w, h, "images/border-panel.svg")
        left = x + 16
        if icon:
            self.image(f"{name}-icon", x + 16, y + (h - 48) // 2, 48, 48, icon)
            left = x + 76
        self.text(f"{name}-label", left, y + 12, x + w - left - 10, 22, label, size=14, color=LABEL)
        self.number(f"{name}-value", left - 4, y + 36, x + w - left - 6, h - 46, value, size=30, color=color,
                    suffix=suffix, precision=precision)

    def export(self):
        return self.items


# ---- 图表 option 片段 ----
def axis(kind="category", show_split=False, label_size=11):
    return {
        "type": kind,
        "axisLabel": {"show": True, "fontSize": label_size, "color": LABEL, "rotate": 0},
        "axisLine": {"show": kind == "category", "lineStyle": {"color": "#2b5a80", "width": 1}},
        "axisTick": {"show": False},
        "splitLine": {"show": show_split, "lineStyle": {"color": GRID_LINE, "width": 1, "type": "dashed"}},
    }


def gradient(top, bottom, horizontal=False):
    return {
        "type": "linear", "x": 0, "y": 0, "x2": 1 if horizontal else 0, "y2": 0 if horizontal else 1,
        "colorStops": [{"offset": 0, "color": top}, {"offset": 1, "color": bottom}],
    }


def dataset(dimensions, rows):
    return {"dimensions": dimensions, "source": [dict(zip(dimensions, row)) for row in rows]}


def legend(show=True, size=12):
    return {"show": show, "x": "right", "y": "top", "textStyle": {"color": LABEL, "fontSize": size},
            "itemHeight": 8, "itemWidth": 12}


def bar_option(dimensions, rows, colors, bar_width=14, label=False, grid=None, horizontal=False):
    series = [
        {
            "type": "bar", "name": dim, "barWidth": bar_width,
            "label": {"show": label, "position": "right" if horizontal else "top", "color": TEXT, "fontSize": 11},
            "itemStyle": {"color": gradient(top, bottom, horizontal), "borderRadius": [0, 3, 3, 0] if horizontal else [3, 3, 0, 0]},
        }
        for dim, (top, bottom) in zip(dimensions[1:], colors)
    ]
    value_axis, category_axis = axis("value", show_split=True), axis("category")
    return {
        "legend": legend(len(series) > 1),
        "grid": grid or {"left": "12%", "top": "36", "right": "5%", "bottom": "28"},
        "xAxis": value_axis if horizontal else category_axis,
        "yAxis": category_axis if horizontal else value_axis,
        "dataset": dataset(dimensions, rows),
        "series": series,
    }


def line_option(dimensions, rows, colors, area=0.18, smooth=True, grid=None, symbol=5):
    series = [
        {
            "type": "line", "name": dim, "smooth": smooth, "symbolSize": symbol,
            "label": {"show": False, "position": "top", "color": TEXT, "fontSize": 11},
            "itemStyle": {"color": color, "borderRadius": 0},
            "lineStyle": {"type": "solid", "width": 2.5, "color": color},
            "areaStyle": {"color": gradient(color, color + "00"), "opacity": area * 4 if area else 0},
        }
        for dim, color in zip(dimensions[1:], colors)
    ]
    return {
        "legend": legend(len(series) > 1),
        "grid": grid or {"left": "12%", "top": "36", "right": "5%", "bottom": "28"},
        "xAxis": merge(axis("category"), {"boundaryGap": False}),
        "yAxis": axis("value", show_split=True),
        "dataset": dataset(dimensions, rows),
        "series": series,
    }


def pie_option(dimensions, rows, colors, radius=("46%", "68%"), center=("50%", "44%")):
    return {
        "type": "ring",
        "legend": {"show": True, "x": "center", "y": "bottom", "textStyle": {"color": LABEL, "fontSize": 12},
                   "itemHeight": 8, "itemWidth": 8},
        "dataset": dataset(dimensions, rows),
        "series": [{
            "type": "pie", "radius": list(radius), "center": list(center), "roseType": False,
            "itemStyle": {"show": True, "borderRadius": 6, "borderColor": "#071324", "borderWidth": 3},
            "label": {"show": False, "position": "center", "formatter": "{b}", "fontSize": 14, "color": TEXT},
            "emphasis": {"label": {"show": True, "fontSize": 20, "fontWeight": "bold", "color": "#ffffff", "formatter": "{b}\n{d}%"}},
            "labelLine": {"show": False},
        }],
        "color": list(colors),
    }


def scroll_board(header, rows, widths, row_num=5):
    return {
        "header": header, "dataset": rows, "index": False, "columnWidth": widths,
        "align": ["center"] * len(header), "rowNum": row_num, "waitTime": 2, "headerHeight": 34,
        "carousel": "single", "headerBGC": "#0d3a6acc", "oddRowBGC": "#06203acc", "evenRowBGC": "#0a2a4a80",
    }


def radar_option(indicators, series):
    """雷达图：indicators=[(名称, 最大值)]，series=[(名称, 值列表, 颜色)]。
    组件首次渲染不会把 dataset 同步到 radar.indicator / series，必须同时写进去。"""
    indicator = [{"name": n, "max": m} for n, m in indicators]
    data = [{"name": name, "value": values, "itemStyle": {"color": color}} for name, values, color in series]
    return {
        "legend": {"show": True, "x": "right", "y": "top", "textStyle": {"color": LABEL, "fontSize": 12},
                   "itemHeight": 8, "itemWidth": 12, "data": [name for name, _, _ in series]},
        "dataset": {"radarIndicator": indicator,
                    "seriesData": [{"name": name, "value": values} for name, values, _ in series]},
        "radar": {"radius": ["0%", "64%"], "center": ["50%", "56%"], "indicator": indicator,
                  "axisName": {"show": True, "color": TEXT, "fontSize": 12},
                  "splitArea": {"show": True, "areaStyle": {"color": ["#0a2a4a33", "#0a2a4a66"]}},
                  "splitLine": {"show": True, "lineStyle": {"color": "#1e4a72"}},
                  "axisLine": {"show": True, "lineStyle": {"color": "#1e4a72"}}},
        "series": [{"name": "radar", "type": "radar", "symbolSize": 4, "areaStyle": {"opacity": 0.25}, "data": data}],
    }


def gauge_option(value, color=CYAN, unit="%"):
    return {
        "dataset": value,
        "series": [{
            "type": "gauge", "data": [{"value": value, "itemStyle": {"color": color}}], "min": 0, "max": 100,
            "center": ["50%", "60%"], "radius": "92%",
            "axisLine": {"lineStyle": {"width": 14, "color": [[value / 100, color], [1, GRID_LINE]]}},
            "axisLabel": {"show": False}, "axisTick": {"show": False}, "splitLine": {"show": False},
            "detail": {"show": True, "valueAnimation": True, "formatter": "{value}" + unit, "color": CYAN_LIGHT,
                       "fontSize": 32, "fontWeight": "bold", "offsetCenter": [0, "-2%"]},
            "pointer": {"show": False}, "animationDuration": 2000, "startAngle": 210, "endAngle": -30,
        }],
    }


def water_option(ratio, top=CYAN, bottom=DEEP_BLUE):
    return {
        "dataset": ratio,
        "series": [{
            "type": "liquidFill", "radius": "86%", "data": [ratio],
            "color": [gradient(top, bottom)],
            "backgroundStyle": {"borderWidth": 2, "borderColor": CYAN + "80", "color": "#06203a"},
            "label": {"normal": {"textStyle": {"fontSize": 30, "color": "#ffffff"}}},
            "outline": {"show": False},
        }],
    }


def canvas_config(name, remarks, background="images/bg-tech-grid.jpg"):
    config = copy.deepcopy(PROTOS["canvas"])
    config.update({"projectName": name, "remarks": remarks, "background": "#030a18",
                   "backgroundImage": f"{{{{material:{background}}}}}" if background else ""})
    return config


def template(name, category, remarks, components, background="images/bg-tech-grid.jpg"):
    return {
        "name": name,
        "category": category,
        "content": {
            "editCanvasConfig": canvas_config(name, remarks, background),
            "requestGlobalConfig": copy.deepcopy(PROTOS["requestGlobalConfig"]),
            "componentList": components,
        },
    }
