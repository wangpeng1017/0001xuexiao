#!/usr/bin/env node
// 校验 server/seed-content/templates 下的 GoView 场景模板，保证组件结构可被编辑器加载。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const templatesDir = path.join(repoRoot, 'server/seed-content/templates');
const componentsRoot = path.join(repoRoot, 'web/src/packages/components');
const manifestPath = path.join(repoRoot, 'server/seed-content/manifest.json');

const errors = [];
const fail = (message) => errors.push(message);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const REQUIRED_CHART_CONFIG_FIELDS = [
  'key',
  'chartKey',
  'conKey',
  'title',
  'category',
  'categoryName',
  'package',
  'image'
];

const REQUEST_HTTP_TYPES = ['get', 'post', 'patch', 'put', 'delete'];
const REQUEST_INTERVAL_UNITS = ['second', 'minute', 'hour', 'day'];
const REQUEST_BODY_TYPES = ['none', 'form-data', 'x-www-form-urlencoded', 'json', 'xml'];
const SCENE_LAYER_TYPES = ['raster', 'vector', 'model', 'service', 'panorama'];
const SERVICE_PROTOCOLS = ['arcgis', 'wms', 'wmts', 'xyz'];
const TEMPLATE_CATEGORIES = ['campus', 'device', 'data', 'other'];

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifestFiles = new Set((manifest.materials || []).map((item) => item.file));

function checkComponents(template, fileName) {
  const content = template.content;
  if (!isObject(content.editCanvasConfig)) {
    fail(`${fileName}: 缺少 editCanvasConfig`);
  } else {
    if (!isFiniteNumber(content.editCanvasConfig.width) || content.editCanvasConfig.width <= 0) {
      fail(`${fileName}: editCanvasConfig.width 不合法`);
    }
    if (!isFiniteNumber(content.editCanvasConfig.height) || content.editCanvasConfig.height <= 0) {
      fail(`${fileName}: editCanvasConfig.height 不合法`);
    }
  }
  if (!isObject(content.requestGlobalConfig)) fail(`${fileName}: 缺少 requestGlobalConfig`);
  if (!Array.isArray(content.componentList) || content.componentList.length === 0) {
    fail(`${fileName}: componentList 必须是非空数组`);
    return [];
  }

  const ids = new Set();
  const layerIds = new Set();

  for (const [index, component] of content.componentList.entries()) {
    const label = `${fileName} 组件[${index}]`;
    if (!isObject(component)) {
      fail(`${label}: 不是对象`);
      continue;
    }
    if (!isNonEmptyString(component.id)) fail(`${label}: 缺少 id`);
    else if (ids.has(component.id)) fail(`${label}: id 重复 ${component.id}`);
    else ids.add(component.id);

    if (component.isGroup !== false) fail(`${label}: isGroup 必须为 false`);
    if (!isNonEmptyString(component.key)) fail(`${label}: 缺少 key`);
    if (!isObject(component.option)) fail(`${label}: 缺少 option`);

    const attr = component.attr;
    if (!isObject(attr)) {
      fail(`${label}: 缺少 attr`);
    } else {
      for (const key of ['x', 'y', 'w', 'h', 'offsetX', 'offsetY']) {
        if (!isFiniteNumber(attr[key])) fail(`${label}: attr.${key} 必须是数字`);
      }
      if (!Number.isInteger(attr.zIndex)) fail(`${label}: attr.zIndex 必须是整数`);
    }

    const styles = component.styles;
    if (!isObject(styles)) {
      fail(`${label}: 缺少 styles`);
    } else {
      for (const key of ['hueRotate', 'saturate', 'contrast', 'brightness', 'opacity', 'rotateZ', 'rotateX', 'rotateY', 'skewX', 'skewY']) {
        if (!isFiniteNumber(styles[key])) fail(`${label}: styles.${key} 必须是数字`);
      }
      if (typeof styles.filterShow !== 'boolean') fail(`${label}: styles.filterShow 必须是布尔值`);
      if (!isNonEmptyString(styles.blendMode)) fail(`${label}: styles.blendMode 不能为空`);
      if (!Array.isArray(styles.animations)) fail(`${label}: styles.animations 必须是数组`);
    }

    if (!isObject(component.preview)) fail(`${label}: 缺少 preview`);
    if (!isObject(component.status) || typeof component.status.lock !== 'boolean' || typeof component.status.hide !== 'boolean') {
      fail(`${label}: status.lock/status.hide 必须是布尔值`);
    }

    const request = component.request;
    if (!isObject(request)) {
      fail(`${label}: 缺少 request`);
    } else {
      if (![0, 1, 2].includes(request.requestDataType)) fail(`${label}: requestDataType 不合法`);
      if (!REQUEST_HTTP_TYPES.includes(request.requestHttpType)) fail(`${label}: requestHttpType 不合法`);
      if (!REQUEST_INTERVAL_UNITS.includes(request.requestIntervalUnit)) {
        fail(`${label}: requestIntervalUnit 不合法`);
      }
      if (![0, 1].includes(request.requestContentType)) fail(`${label}: requestContentType 不合法`);
      if (!REQUEST_BODY_TYPES.includes(request.requestParamsBodyType)) {
        fail(`${label}: requestParamsBodyType 不合法`);
      }
      if (!isObject(request.requestSQLContent) || typeof request.requestSQLContent.sql !== 'string') {
        fail(`${label}: 缺少 requestSQLContent.sql`);
      }
      if (!isObject(request.requestParams) || !isObject(request.requestParams.Body) || !isObject(request.requestParams.Header) || !isObject(request.requestParams.Params)) {
        fail(`${label}: requestParams 结构不完整`);
      }
      if (typeof request.requestUrl !== 'string') fail(`${label}: requestUrl 必须是字符串`);
    }

    const events = component.events;
    if (!isObject(events) || !isObject(events.baseEvent) || !isObject(events.advancedEvents) || !Array.isArray(events.interactEvents)) {
      fail(`${label}: events 结构不完整`);
    }

    const chartConfig = component.chartConfig;
    if (!isObject(chartConfig)) {
      fail(`${label}: 缺少 chartConfig`);
      continue;
    }
    for (const field of REQUIRED_CHART_CONFIG_FIELDS) {
      if (!isNonEmptyString(chartConfig[field])) fail(`${label}: chartConfig.${field} 不能为空`);
    }
    if (!isNonEmptyString(chartConfig.chartFrame)) fail(`${label}: chartConfig.chartFrame 不能为空`);
    if (component.key !== chartConfig.key) fail(`${label}: key 与 chartConfig.key 不一致`);

    if (
      isNonEmptyString(chartConfig.package) &&
      isNonEmptyString(chartConfig.category) &&
      isNonEmptyString(chartConfig.key)
    ) {
      const configPath = path.join(
        componentsRoot,
        chartConfig.package,
        chartConfig.category,
        chartConfig.key,
        'config.ts'
      );
      if (!existsSync(configPath)) {
        fail(
          `${label}: 找不到 config.ts -> ${path.relative(repoRoot, configPath)}（${chartConfig.package}/${chartConfig.category}/${chartConfig.key}）`
        );
      }
    }

    if (chartConfig.package === 'Scenes' && chartConfig.key === 'Scene3D') {
      checkSceneOption(component.option, label, layerIds);
    }
  }

  return content.componentList;
}

function checkSceneOption(option, label, layerIds) {
  const sceneLabel = `${label} 三维 option`;
  if (!['3D', '2.5D', '2D'].includes(option.sceneMode)) {
    fail(`${sceneLabel}: sceneMode 必须为 3D/2.5D/2D`);
  }
  if (!isObject(option.camera)) {
    fail(`${sceneLabel}: 缺少 camera`);
  } else {
    for (const key of ['lon', 'lat', 'height', 'heading', 'pitch', 'roll']) {
      if (!isFiniteNumber(option.camera[key])) fail(`${sceneLabel}: camera.${key} 必须是数字`);
    }
    if (option.camera.lon < -180 || option.camera.lon > 180) fail(`${sceneLabel}: camera.lon 超出范围`);
    if (option.camera.lat < -90 || option.camera.lat > 90) fail(`${sceneLabel}: camera.lat 超出范围`);
  }
  if (!isNonEmptyString(option.baseLayer)) fail(`${sceneLabel}: 缺少 baseLayer`);
  if (!Array.isArray(option.layerSets) || option.layerSets.length === 0) {
    fail(`${sceneLabel}: layerSets 必须是非空数组`);
    return;
  }

  for (const [setIndex, set] of option.layerSets.entries()) {
    const setLabel = `${sceneLabel} layerSets[${setIndex}]`;
    if (!isObject(set)) {
      fail(`${setLabel}: 不是对象`);
      continue;
    }
    if (!isNonEmptyString(set.id)) fail(`${setLabel}: 缺少 id`);
    if (!isNonEmptyString(set.name)) fail(`${setLabel}: 缺少 name`);
    if (typeof set.visible !== 'boolean') fail(`${setLabel}: visible 必须是布尔值`);
    if (!Array.isArray(set.layers)) {
      fail(`${setLabel}: layers 必须是数组`);
      continue;
    }
    for (const [layerIndex, layer] of set.layers.entries()) {
      const layerLabel = `${setLabel}.layers[${layerIndex}]`;
      if (!isObject(layer)) {
        fail(`${layerLabel}: 不是对象`);
        continue;
      }
      if (!isNonEmptyString(layer.id)) fail(`${layerLabel}: 缺少 id`);
      else if (layerIds.has(layer.id)) fail(`${layerLabel}: 图层 id 重复 ${layer.id}`);
      else layerIds.add(layer.id);
      if (!isNonEmptyString(layer.name)) fail(`${layerLabel}: 缺少 name`);
      if (!SCENE_LAYER_TYPES.includes(layer.type)) fail(`${layerLabel}: type 不合法`);
      if (!isObject(layer.source)) fail(`${layerLabel}: 缺少 source`);
      if (typeof layer.visible !== 'boolean') fail(`${layerLabel}: visible 必须是布尔值`);
      if (!isFiniteNumber(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
        fail(`${layerLabel}: opacity 必须在 0~1`);
      }
      if (!isObject(layer.style)) fail(`${layerLabel}: 缺少 style`);
      if (!isObject(layer.source)) continue;

      const source = layer.source;
      if (layer.type === 'raster' || layer.type === 'vector') {
        if (!isNonEmptyString(source.url)) fail(`${layerLabel}: ${layer.type} 图层的 source.url 不能为空`);
        if (source.from !== undefined && !['datafile', 'material', 'url'].includes(source.from)) {
          fail(`${layerLabel}: source.from 不合法`);
        }
        if (source.refId !== undefined && typeof source.refId !== 'string') {
          fail(`${layerLabel}: source.refId 必须是字符串`);
        }
      } else if (layer.type === 'model') {
        if (!isNonEmptyString(source.url)) fail(`${layerLabel}: model 图层的 source.url 不能为空`);
        if (!['gltf', '3dtiles'].includes(source.format)) fail(`${layerLabel}: model format 不合法`);
        for (const key of ['position', 'rotation']) {
          if (!isObject(source[key])) fail(`${layerLabel}: model 缺少 ${key}`);
        }
        if (isObject(source.position)) {
          for (const key of ['lon', 'lat', 'height']) {
            if (!isFiniteNumber(source.position[key])) fail(`${layerLabel}: position.${key} 必须是数字`);
          }
        }
        if (isObject(source.rotation)) {
          for (const key of ['heading', 'pitch', 'roll']) {
            if (!isFiniteNumber(source.rotation[key])) fail(`${layerLabel}: rotation.${key} 必须是数字`);
          }
        }
        if (!isFiniteNumber(source.scale)) fail(`${layerLabel}: model scale 必须是数字`);
        if (source.from !== undefined && !['datafile', 'material', 'url'].includes(source.from)) {
          fail(`${layerLabel}: source.from 不合法`);
        }
      } else if (layer.type === 'service') {
        if (!isNonEmptyString(source.product)) fail(`${layerLabel}: service 缺少 product`);
        if (!SERVICE_PROTOCOLS.includes(source.protocol)) fail(`${layerLabel}: service protocol 不合法`);
        if (!isNonEmptyString(source.url)) fail(`${layerLabel}: service 缺少 url`);
      } else if (layer.type === 'panorama') {
        if (!Array.isArray(source.points) || source.points.length === 0) {
          fail(`${layerLabel}: panorama 必须包含 points`);
          continue;
        }
        for (const [pointIndex, point] of source.points.entries()) {
          const pointLabel = `${layerLabel}.points[${pointIndex}]`;
          if (!isObject(point)) {
            fail(`${pointLabel}: 不是对象`);
            continue;
          }
          if (!isNonEmptyString(point.id) || !isNonEmptyString(point.name)) {
            fail(`${pointLabel}: 缺少 id/name`);
          }
          if (!isFiniteNumber(point.lon) || !isFiniteNumber(point.lat)) {
            fail(`${pointLabel}: lon/lat 必须是数字`);
          }
          if (!isNonEmptyString(point.imageUrl)) fail(`${pointLabel}: 缺少 imageUrl`);
        }
      }
    }
  }
}

function componentKeys(components) {
  return components.map((component) => component.chartConfig?.key);
}

function countKey(components, key) {
  return components.filter((component) => component.chartConfig?.key === key).length;
}

function checkPlaceholders(raw, fileName) {
  const matches = raw.matchAll(/\{\{material:([^}]+)\}\}/g);
  let count = 0;
  for (const match of matches) {
    count += 1;
    const file = match[1].trim();
    if (!manifestFiles.has(file)) {
      fail(`${fileName}: 占位符引用了 manifest 中不存在的素材 ${file}`);
    }
  }
  if (count === 0) fail(`${fileName}: 未使用任何素材占位符`);
}

function checkCampusTemplate(fileName, template, components) {
  const scene = components.find(
    (component) => component.chartConfig?.package === 'Scenes' && component.chartConfig?.key === 'Scene3D'
  );
  if (!scene) {
    fail(`${fileName}: 缺少三维场景组件`);
  } else {
    const { camera, sceneMode, layerSets } = scene.option;
    if (sceneMode !== '3D') fail(`${fileName}: 三维场景必须使用 3D 模式`);
    if (!(camera.lon >= 116.3 && camera.lon <= 116.32)) fail(`${fileName}: 相机经度需在 116.30~116.32`);
    if (!(camera.lat >= 39.99 && camera.lat <= 40.01)) fail(`${fileName}: 相机纬度需在 39.99~40.01`);
    const setNames = layerSets.map((set) => set.name);
    for (const name of ['校园底图', '校园要素', '三维模型', '360 街景']) {
      if (!setNames.includes(name)) fail(`${fileName}: 缺少图层集「${name}」`);
    }
    const layers = layerSets.flatMap((set) => set.layers);
    const urls = layers.map((layer) =>
      layer.type === 'panorama'
        ? (layer.source.points || []).map((point) => point.imageUrl).join(',')
        : layer.source.url
    );
    if (!urls.some((url) => typeof url === 'string' && url.includes('campus-tiles.zip'))) {
      fail(`${fileName}: 缺少校园离线瓦片图层`);
    }
    for (const asset of ['campus-buildings.geojson', 'campus-roads.geojson', 'campus-poi.geojson']) {
      if (!urls.some((url) => typeof url === 'string' && url.includes(asset))) {
        fail(`${fileName}: 缺少矢量图层 ${asset}`);
      }
    }
    const modelUrls = layers.filter((layer) => layer.type === 'model').map((layer) => layer.source.url || '');
    if (!modelUrls.some((url) => url.includes('teaching-building.glb'))) {
      fail(`${fileName}: 缺少教学楼模型`);
    }
    if (modelUrls.filter((url) => url.includes('tree.glb')).length < 2) {
      fail(`${fileName}: 至少需要 2 棵树模型`);
    }
    if (!urls.some((url) => typeof url === 'string' && url.includes('panorama-demo.jpg'))) {
      fail(`${fileName}: 缺少 360 街景点位图`);
    }
    if (!(scene.option.camera.height > 0)) fail(`${fileName}: 相机高度必须大于 0`);
  }
  if (!/bg-tech-/.test(template.content.editCanvasConfig?.backgroundImage || '')) {
    fail(`${fileName}: 背景图应使用 bg-tech-* 素材`);
  }
  if (countKey(components, 'BarCommon') < 1) fail(`${fileName}: 缺少柱状图`);
  if (countKey(components, 'PieCommon') < 1) fail(`${fileName}: 缺少饼图`);
  if (!componentKeys(components).includes('Border01')) fail(`${fileName}: 缺少边框装饰`);
}

function checkDeviceTemplate(fileName, template, components) {
  if (countKey(components, 'LineCommon') < 1) fail(`${fileName}: 缺少折线图`);
  if (countKey(components, 'Dial') + countKey(components, 'WaterPolo') < 1) {
    fail(`${fileName}: 缺少仪表盘/水球图`);
  }
  if (countKey(components, 'TablesBasic') < 1) fail(`${fileName}: 缺少表格`);
  const video = components.find((component) => component.chartConfig?.key === 'RtspVideo');
  if (!video) {
    fail(`${fileName}: 缺少摄像头视频组件`);
  } else if (video.option?.rtspUrl !== '') {
    fail(`${fileName}: 摄像头视频的 rtspUrl 必须留空作为占位`);
  }
  const raw = JSON.stringify(template.content);
  for (const icon of ['icon-server.svg', 'icon-camera.svg', 'icon-alarm.svg']) {
    if (!raw.includes(icon)) fail(`${fileName}: 缺少图标素材 ${icon}`);
  }
}

function checkTeachingTemplate(fileName, template, components) {
  if (countKey(components, 'BarCommon') < 2) fail(`${fileName}: 至少需要 2 个柱状图`);
  if (countKey(components, 'LineCommon') < 1) fail(`${fileName}: 缺少折线图`);
  if (countKey(components, 'PieCommon') < 1) fail(`${fileName}: 缺少饼图`);
  if (countKey(components, 'Number') < 4) fail(`${fileName}: 至少需要 4 个数字卡片`);
  const dynamic = components.find(
    (component) => component.request?.requestDataType === 1 && component.request?.requestUrl === ''
  );
  if (!dynamic) fail(`${fileName}: 缺少 requestUrl 为空的动态请求图表`);
  const remarks = template.content.editCanvasConfig?.remarks || '';
  if (!remarks.includes('绑定数据集后在此粘贴接口地址')) {
    fail(`${fileName}: 项目备注缺少动态接口说明`);
  }
}

function main() {
  const jsonFiles = readdirSync(templatesDir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort();
  if (jsonFiles.length !== 3) {
    fail(`模板数量应为 3，实际为 ${jsonFiles.length}`);
  }

  const templates = [];
  for (const fileName of jsonFiles) {
    const fullPath = path.join(templatesDir, fileName);
    let template;
    try {
      template = JSON.parse(readFileSync(fullPath, 'utf8'));
    } catch (error) {
      fail(`${fileName}: JSON 解析失败：${error.message}`);
      continue;
    }
    if (!isNonEmptyString(template.name)) fail(`${fileName}: 缺少 name`);
    if (!TEMPLATE_CATEGORIES.includes(template.category)) {
      fail(`${fileName}: category 必须为 ${TEMPLATE_CATEGORIES.join('/')}`);
    }
    if (!isObject(template.content)) {
      fail(`${fileName}: 缺少 content`);
      continue;
    }
    if (!existsSync(path.join(templatesDir, `${path.basename(fileName, '.json')}.png`))) {
      fail(`${fileName}: 缺少同名封面 PNG`);
    }
    checkPlaceholders(JSON.stringify(template.content), fileName);
    const components = checkComponents(template, fileName);

    if (fileName === 'campus-3d.json') checkCampusTemplate(fileName, template, components);
    if (fileName === 'device-monitor.json') checkDeviceTemplate(fileName, template, components);
    if (fileName === 'teaching-stats.json') checkTeachingTemplate(fileName, template, components);
    templates.push(template);
  }

  const names = new Set(templates.map((template) => template.name));
  if (names.size !== templates.length) fail('模板名称存在重复');
  const categories = new Set(templates.map((template) => template.category));
  for (const category of ['campus', 'device', 'data']) {
    if (!categories.has(category)) fail(`缺少分类 ${category} 的模板`);
  }

  if (errors.length) {
    console.error(`模板校验失败（${errors.length} 项）：`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`模板校验通过：${jsonFiles.length} 个模板，${templates.reduce((total, item) => total + item.content.componentList.length, 0)} 个组件`);
}

main();
