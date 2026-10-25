<template>
  <collapse-item name="属性" :expanded="true">
    <setting-item-box name="路径" :alone="true">
      <setting-item>
        <n-input v-model:value="optionData.dataset" size="small"></n-input>
      </setting-item>
      <setting-item>
        <n-button size="small" secondary block @click="pickerShow = true">
          从素材库选择
        </n-button>
      </setting-item>
    </setting-item-box>
    <setting-item-box name="样式">
      <setting-item name="类型">
        <n-select
          v-model:value="optionData.fit"
          size="small"
          :options="fitList"
        ></n-select>
      </setting-item>
      <setting-item name="圆角">
        <n-input-number
          v-model:value="optionData.borderRadius"
          size="small"
          :min="0"
          placeholder="圆角"
        ></n-input-number>
      </setting-item>
    </setting-item-box>
    <material-picker
      v-model:show="pickerShow"
      category="image2d"
      :current-url="optionData.dataset"
      @select="handleMaterialSelect"
    />
  </collapse-item>
</template>

<script setup lang="ts">
import { PropType, ref } from 'vue'
import { option } from './config'
import {
  CollapseItem,
  SettingItemBox,
  SettingItem,
} from '@/components/Pages/ChartItemSetting'
import MaterialPicker from '@/views/material/components/MaterialPicker.vue'

const props = defineProps({
  optionData: {
    type: Object as PropType<typeof option>,
    required: true,
  },
})

const pickerShow = ref(false)

const handleMaterialSelect = (item: { url: string }) => {
  props.optionData.dataset = item.url
}

// 适应类型
const fitList = [
  {
    value: 'fill',
    label: 'fill'
  },
  {
    value: 'contain',
    label: 'contain'
  },
  {
    value: 'cover',
    label: 'cover'
  },
  {
    value: 'scale-down',
    label: 'scale-down'
  },
  {
    value: 'none',
    label: 'none'
  },
]
</script>
