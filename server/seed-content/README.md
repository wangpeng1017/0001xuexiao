# 预置素材库（F018）

本目录是可视化平台的预置素材包，覆盖需求 R4 中的模型素材、地图素材和二维素材，用于离线演示与教学实训。

**版权声明：本目录下所有素材（GLB、GeoJSON、XYZ 瓦片、JPG/PNG 图片、SVG）全部由本项目 `_generators` 目录内的 Python 脚本程序生成，没有从网络下载，也不包含任何第三方图片、模型、图标或字体素材，无第三方版权。** 素材随本项目一同分发，可自由用于本项目部署、教学演示和二次修改。

**地图合规声明：校园及其道路、建筑、兴趣点均为虚构，仅用于功能演示。素材不包含任何国界、省界、行政区划边界、真实测绘底图或在线地图截图，不得作为真实地理数据使用。**

## 目录结构

```
server/seed-content/
├── manifest.json                  # 素材清单（version + file/category/name）
├── README.md                      # 本文件
├── models/                        # glTF 2.0 二进制模型
│   ├── teaching-building.glb
│   ├── tree.glb
│   ├── signpost.glb
│   └── server-rack.glb
├── maps/                          # 矢量与离线瓦片
│   ├── campus-roads.geojson
│   ├── campus-buildings.geojson
│   ├── campus-poi.geojson
│   └── campus-tiles.zip
├── images/                        # 大屏背景、装饰、图标、全景图
│   ├── bg-tech-grid.jpg
│   ├── bg-tech-aurora.jpg
│   ├── bg-tech-wave.jpg
│   ├── title-decor-left.svg
│   ├── title-decor-right.svg
│   ├── border-corners.svg
│   ├── border-panel.svg
│   ├── icon-camera.svg
│   ├── icon-sensor.svg
│   ├── icon-server.svg
│   ├── icon-alarm.svg
│   └── panorama-demo.jpg
└── _generators/                   # 生成、校验脚本与生成摘要
    ├── generate_all.py
    ├── generate_models.py
    ├── generate_maps.py
    ├── generate_images.py
    ├── generate_manifest.py
    ├── gltf_writer.py
    ├── campus_data.py
    ├── verify_assets.py
    └── SUMMARY.md
```

## 素材说明

### 1. 模型素材（GLB）

全部为 glTF 2.0 二进制格式，Y 轴向上，单位为米，原点位于模型底面中心；使用 PBR `baseColorFactor` 材质，不依赖贴图，适合完全离线加载。

| 文件 | 名称 | 用途 |
| --- | --- | --- |
| `models/teaching-building.glb` | 教学楼模型 | 约 60m×20m×24m 的多长方体组合建筑，带窗户色块、入口雨棚和屋顶天线；用于三维校园主建筑。 |
| `models/tree.glb` | 景观树模型 | 约 8m 高，圆柱树干 + 三层圆锥树冠；用于道路、广场和建筑周边绿化。 |
| `models/signpost.glb` | 监控立杆模型 | 约 6m 高，细圆柱立杆 + 顶部摄像机/太阳能板；用于监控点位和设备布设演示。 |
| `models/server-rack.glb` | 服务器机柜模型 | 约 0.6m×1m×2m，含服务器面板和状态指示灯；用于实训室、机房场景。 |

每个 GLB 均小于 2 MB。

### 2. 地图素材

| 文件 | 名称 | 用途 |
| --- | --- | --- |
| `maps/campus-roads.geojson` | 校园道路矢量 | 10 条虚构校园道路（LineString），属性含 `name`、`kind`、`width_m`；可用于道路图层和样式演示。 |
| `maps/campus-buildings.geojson` | 校园建筑轮廓矢量 | 12 栋虚构建筑（Polygon），属性含 `name`、`height`、`type`（教学楼/宿舍/食堂/实验楼/体育馆）；可用于建筑白模拉伸。 |
| `maps/campus-poi.geojson` | 校园兴趣点矢量 | 16 个兴趣点（Point），包括校门、图书馆、监控点位、环境监测点等；可用于点位图标图层。 |
| `maps/campus-tiles.zip` | 校园离线示意瓦片（z14–17） | XYZ 目录结构 `{z}/{x}/{y}.png`，256×256；按上述 GeoJSON 以 Web Mercator 程序绘制的浅色示意底图，覆盖 116.30–116.32E / 39.99–40.01N，用于完全离线的大屏演示。 |

以上坐标统一为 WGS84 经纬度，并限制在虚构校园范围内。瓦片无任何行政区划边界内容。

### 3. 二维素材

| 文件 | 名称 | 用途 |
| --- | --- | --- |
| `images/bg-tech-grid.jpg` | 科技网格大屏背景 | 1920×1080 深蓝透视网格与光点，适合综合态势大屏。 |
| `images/bg-tech-aurora.jpg` | 极光粒子大屏背景 | 1920×1080 蓝紫极光、同心弧线与星点，适合监控中心大屏。 |
| `images/bg-tech-wave.jpg` | 数据波动大屏背景 | 1920×1080 数据波浪与透视地面，适合数据分析大屏。 |
| `images/title-decor-left.svg` | 标题栏左侧装饰 | 透明 SVG，作为标题左翼。 |
| `images/title-decor-right.svg` | 标题栏右侧装饰 | 与左侧镜像对称的透明 SVG，作为标题右翼。 |
| `images/border-corners.svg` | 大屏四角边框 | 1920×1080 透明叠加边框，可随大屏容器缩放。 |
| `images/border-panel.svg` | 面板科技边框 | 800×600 透明面板边框，用于图表卡片。 |
| `images/icon-camera.svg` | 摄像头图标 | 64×64 线性图标，用于视频监控点位。 |
| `images/icon-sensor.svg` | 传感器图标 | 64×64 线性图标，用于物联网设备点位。 |
| `images/icon-server.svg` | 服务器图标 | 64×64 线性图标，用于机房/算力资源。 |
| `images/icon-alarm.svg` | 告警图标 | 64×64 线性图标，用于告警列表和事件提示。 |
| `images/panorama-demo.jpg` | 校园 360° 全景示例图 | 4096×2048 等距柱状投影（2:1），程序绘制的天空、地面和地平线地标；左右接缝连续，用于 Photo Sphere Viewer 全景图层演示。 |

SVG 均使用透明背景和标准矢量元素，不引用外部字体或图片。

### 4. 清单文件

`manifest.json` 是后端素材列表的稳定入口：

```json
{
  "version": 1,
  "materials": [
    { "file": "models/tree.glb", "category": "model|map|image2d", "name": "中文名称" }
  ]
}
```

`file` 为相对本目录的路径，统一使用 `/`。`category` 只有 `model`、`map`、`image2d` 三种。当前共 20 个素材。

## 使用建议

- **模型**：可直接由 Cesium 的 `Model.fromGltf`（或等价加载器）加载；单位是米，Y 轴向上，原点在底面中心，便于按经纬度落地和高度调整。
- **矢量**：GeoJSON 可直接作为 Cesium `GeoJsonDataSource` 的数据源；建筑 `height` 可用于拉伸白模。
- **瓦片**：将 `campus-tiles.zip` 解压到后端的静态瓦片目录，按 `/tiles/{z}/{x}/{y}.png` 模板访问即形成离线 XYZ 底图。
- **全景**：等距柱状投影，宽高比严格 2:1，可直接绑定到全景查看器。
- **二维背景**：图案以中间区域留白、亮度较低，适合叠加大屏组件和文字。

## 导入与更新

`pnpm db:seed` 会把本目录导入数据库。每个素材、模板按“内容哈希”判断：与上次导入一致就跳过，不一致就原位更新（素材 id 与地址不变，模板的项目 id 不变，已用模板新建的项目不受影响）。升级后重新执行即可获得新底图和新模板。

注意：模板在升级时会被种子内容覆盖，请在“从模板新建”的副本上修改，不要直接改库里的预置模板。

`campus-3d.png` 是模板预览的真实截图（1280×720），不由 `generate_template_covers.py` 生成；模板改版后需要重新截图替换。

## 重新生成

环境要求：Python 3.11、Pillow、numpy。GLB 的可选读回校验需要 pygltflib。

```bash
python -m pip install --user pillow numpy pygltflib
python server/seed-content/_generators/generate_all.py
```

`generate_all.py` 会依次生成模型、GeoJSON/瓦片、二维素材、`manifest.json`，最后运行校验并重写 `_generators/SUMMARY.md`。

只做校验：

```bash
python server/seed-content/_generators/verify_assets.py
```

生成过程使用固定随机种子，输出可重复；不访问网络。校验覆盖 GLB 头/chunk/accessor min-max/法线/绕序、GeoJSON 结构、瓦片 ZIP、图片尺寸、全景接缝、SVG XML、清单完整性和 40 MB 总体积上限。
