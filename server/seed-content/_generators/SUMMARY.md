# F018 预置素材生成摘要

> 生成日期：2026-10-25 ｜ 生成脚本：`server/seed-content/_generators/generate_all.py`

**结论：全部校验通过**

总体积 **1.36 MB**（上限 40 MB），共 31 个文件，其中素材 20 个。

所有素材均由本地程序生成，未下载任何第三方素材，也无第三方版权。

## 一、素材清单

| 类别 | 文件 | 中文名称 | 体积 |
|---|---|---|---|
| 模型 | `models/teaching-building.glb` | 教学楼模型 | 199.8 KB |
| 模型 | `models/tree.glb` | 景观树模型 | 13.5 KB |
| 模型 | `models/signpost.glb` | 监控立杆模型 | 18.4 KB |
| 模型 | `models/server-rack.glb` | 服务器机柜模型 | 88.8 KB |
| 地图 | `maps/campus-roads.geojson` | 校园道路矢量 | 5.9 KB |
| 地图 | `maps/campus-buildings.geojson` | 校园建筑轮廓矢量 | 8.5 KB |
| 地图 | `maps/campus-poi.geojson` | 校园兴趣点矢量 | 4.3 KB |
| 地图 | `maps/campus-tiles.zip` | 校园离线示意瓦片（z14–17） | 109.4 KB |
| 二维 | `images/bg-tech-grid.jpg` | 科技网格大屏背景 | 158.1 KB |
| 二维 | `images/bg-tech-aurora.jpg` | 极光粒子大屏背景 | 123.1 KB |
| 二维 | `images/bg-tech-wave.jpg` | 数据波动大屏背景 | 182.5 KB |
| 二维 | `images/title-decor-left.svg` | 标题栏左侧装饰 | 1.9 KB |
| 二维 | `images/title-decor-right.svg` | 标题栏右侧装饰 | 2.0 KB |
| 二维 | `images/border-corners.svg` | 大屏四角边框 | 2.2 KB |
| 二维 | `images/border-panel.svg` | 面板科技边框 | 2.2 KB |
| 二维 | `images/icon-camera.svg` | 摄像头图标 | 831 B |
| 二维 | `images/icon-sensor.svg` | 传感器图标 | 808 B |
| 二维 | `images/icon-server.svg` | 服务器图标 | 795 B |
| 二维 | `images/icon-alarm.svg` | 告警图标 | 831 B |
| 二维 | `images/panorama-demo.jpg` | 校园 360° 全景示例图 | 342.7 KB |

## 二、GLB 模型

| 文件 | 体积 | 顶点 | 三角形 | 包围盒（m，X×Y×Z） | 读回 |
|---|---:|---:|---:|---|---|
| `models/teaching-building.glb` | 199.8 KB | 7332 | 3636 | 61.40×24.11×25.30 | pygltflib 读回通过 |
| `models/tree.glb` | 13.5 KB | 408 | 144 | 4.90×8.00×4.90 | pygltflib 读回通过 |
| `models/signpost.glb` | 18.4 KB | 504 | 228 | 1.99×6.20×0.92 | pygltflib 读回通过 |
| `models/server-rack.glb` | 88.8 KB | 3168 | 1584 | 0.62×2.02×1.07 | pygltflib 读回通过 |

校验内容：GLB 头与 chunk 长度、accessor min/max 与二进制数据一致、bufferView 边界/对齐、
法线单位长度、索引越界、三角形绕序、材质 baseColorFactor、底面 y=0、尺寸范围，文件均 ≤2 MB。

## 三、地图与离线瓦片

- `maps/campus-roads.geojson`：10 个校园道路，坐标全部位于校园范围 116.30–116.32E / 39.99–40.01N。
- `maps/campus-buildings.geojson`：12 个校园建筑轮廓，坐标全部位于校园范围 116.30–116.32E / 39.99–40.01N。
- `maps/campus-poi.geojson`：16 个校园兴趣点，坐标全部位于校园范围 116.30–116.32E / 39.99–40.01N。
- `maps/campus-tiles.zip`：210 张 256×256 PNG，压缩后 109.4 KB；各级瓦片数 z14=16、z15=25、z16=49、z17=120。
- 已检查 zip CRC、XYZ 路径、z=14~17 覆盖范围和瓦片尺寸；不包含任何国界/省界/行政区划数据。

## 四、二维素材

- `images/bg-tech-grid.jpg`：1920×1080，平均亮度 59.4，标准差 47.0。
- `images/bg-tech-aurora.jpg`：1920×1080，平均亮度 69.6，标准差 45.0。
- `images/bg-tech-wave.jpg`：1920×1080，平均亮度 55.8，标准差 41.3。
- `images/panorama-demo.jpg`：4096×2048，左右接缝平均差 0.26 / 最大差 8（0–255），天空 RGB [26.8, 68.2, 119.8]，地面 RGB [44.5, 74.6, 44.9]。
- `images/border-corners.svg`：SVG，viewBox 0 0 1920 1080，XML 解析通过。
- `images/border-panel.svg`：SVG，viewBox 0 0 800 600，XML 解析通过。
- `images/icon-alarm.svg`：SVG，viewBox 0 0 64 64，XML 解析通过。
- `images/icon-camera.svg`：SVG，viewBox 0 0 64 64，XML 解析通过。
- `images/icon-sensor.svg`：SVG，viewBox 0 0 64 64，XML 解析通过。
- `images/icon-server.svg`：SVG，viewBox 0 0 64 64，XML 解析通过。
- `images/title-decor-left.svg`：SVG，viewBox 0 0 800 88，XML 解析通过。
- `images/title-decor-right.svg`：SVG，viewBox 0 0 800 88，XML 解析通过。

## 五、校验明细

- [通过] GLB 模型结构与几何校验（4 个）
- [通过] GeoJSON 结构与坐标范围校验（3 个）
- [通过] XYZ 瓦片包（z14–17）校验
- [通过] 二维图片与 SVG 校验
- [通过] manifest 完整性与总体积（≤40 MB）

## 六、重新生成

```bash
python server/seed-content/_generators/generate_all.py
python server/seed-content/_generators/verify_assets.py
```

依赖 Python 3.11、Pillow、numpy；可选安装 pygltflib 做 GLB 读回校验。随机种子固定，重复生成结果稳定。
