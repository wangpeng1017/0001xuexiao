<template>
  <n-form size="small" label-placement="left" label-width="108" class="layer-form">
    <n-form-item label="GIS 产品">
      <div class="gis-product-box">
        <n-select
          v-model:value="draft.source.product"
          size="small"
          :options="productOptions"
          data-testid="service-product"
          @update:value="handleProductChange"
        />
        <div class="gis-hint">平台支持以下 GIS 产品发布的服务</div>
      </div>
    </n-form-item>
    <n-form-item label="服务协议">
      <n-select
        v-model:value="draft.source.protocol"
        size="small"
        :options="protocolOptions"
        data-testid="service-protocol"
        @update:value="handleProtocolChange"
      />
    </n-form-item>
    <n-form-item label="服务地址">
      <n-input
        v-model:value="draft.source.url"
        :placeholder="protocolMeta.urlPlaceholder"
        data-testid="service-url"
      />
    </n-form-item>

    <template v-if="draft.source.protocol === 'wms' || draft.source.protocol === 'wmts'">
      <n-form-item label="图层名 (layers)">
        <n-input v-model:value="draft.source.layers" placeholder="例如 workspace:layer" data-testid="service-layers" />
      </n-form-item>
      <n-form-item label="样式 (style)">
        <n-input v-model:value="draft.source.style" placeholder="留空使用服务默认样式" />
      </n-form-item>
      <n-form-item label="图片格式">
        <n-select v-model:value="draft.source.format" size="small" :options="formatOptions" />
      </n-form-item>
      <n-form-item v-if="draft.source.protocol === 'wmts'" label="矩阵集">
        <n-input v-model:value="draft.source.tileMatrixSet" placeholder="EPSG:4326" />
      </n-form-item>
    </template>
    <n-form-item v-else-if="draft.source.protocol === 'arcgis'" label="说明">
      <span class="form-text">直接填写 ArcGIS MapServer REST 服务地址，无需图层名。</span>
    </n-form-item>

    <n-alert type="info" :bordered="false" :show-icon="false" class="form-tip">
      底层仅使用 4 种标准 Provider：ArcGIS MapServer / WMS / WMTS / XYZ。产品下拉框只决定可选协议和参数模板。
    </n-alert>
  </n-form>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GIS_PRODUCTS, findGisProduct, LayerDraft } from '../../types'

const props = defineProps<{
  draft: LayerDraft
}>()

if (!props.draft.source.product) props.draft.source.product = 'geoserver'
if (!props.draft.source.protocol) props.draft.source.protocol = 'wms'

const productOptions = GIS_PRODUCTS.map(item => ({ label: item.label, value: item.value }))

const currentProduct = computed(() => findGisProduct(props.draft.source.product))

const protocolOptions = computed(() =>
  currentProduct.value.protocols.map(item => ({ label: item.label, value: item.value }))
)

const protocolMeta = computed(() => {
  const protocol = currentProduct.value.protocols.find(
    item => item.value === props.draft.source.protocol
  )
  return protocol || currentProduct.value.protocols[0]
})

const formatOptions = [
  { label: 'image/png', value: 'image/png' },
  { label: 'image/jpeg', value: 'image/jpeg' }
]

const applyProtocolDefaults = (protocol: string) => {
  const target = currentProduct.value.protocols.find(item => item.value === protocol)
  if (!target) return
  props.draft.source.format = target.defaultFormat || 'image/png'
  props.draft.source.tileMatrixSet = target.defaultTileMatrixSet || 'EPSG:4326'
}

const handleProductChange = () => {
  const firstProtocol = currentProduct.value.protocols[0].value
  props.draft.source.protocol = firstProtocol
  props.draft.source.url = ''
  props.draft.source.layers = ''
  applyProtocolDefaults(firstProtocol)
}

const handleProtocolChange = (protocol: string) => {
  applyProtocolDefaults(protocol)
}
</script>

<style lang="scss" scoped>
.gis-product-box {
  width: 100%;
}
.gis-hint {
  margin-top: 2px;
  font-size: 11px;
  color: #8ea6a1;
}
.form-text {
  font-size: 12px;
  color: #9fb7b1;
}
</style>
