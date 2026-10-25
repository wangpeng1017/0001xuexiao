<template>
  <n-modal
    :show="show"
    preset="card"
    title="从素材库选择"
    style="width: 760px"
    @update:show="emit('update:show', $event)"
  >
    <div class="picker-toolbar">
      <n-input
        v-model:value.trim="keyword"
        clearable
        placeholder="搜索素材名称"
        style="width: 240px"
        @keyup.enter="fetchList"
        @clear="fetchList"
      />
      <n-button secondary @click="fetchList">搜索</n-button>
    </div>

    <n-spin :show="loading">
      <div class="picker-grid">
        <div
          v-for="item in list"
          :key="item.id"
          class="picker-card"
          :class="{ 'is-active': currentUrl === item.url }"
          @click="select(item)"
        >
          <div class="picker-thumb">
            <n-image
              object-fit="contain"
              height="90"
              preview-disabled
              :src="thumbOf(item)"
              :fallback-src="requireErrorImg()"
            />
          </div>
          <n-text class="picker-name go-ellipsis-1">{{ item.name }}</n-text>
          <n-tag size="tiny" :bordered="false" type="info">
            {{ item.scope === 'public' ? '公共' : '私有' }}
          </n-tag>
        </div>
        <n-empty
          v-if="!loading && list.length === 0"
          description="暂无二维素材，请先在素材库上传"
          class="picker-empty"
        />
      </div>
    </n-spin>
  </n-modal>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { materialListApi } from '@/api/path'
import type { MaterialCategory, MaterialItem } from '@/api/path/material'
import { requireErrorImg } from '@/utils'

const props = withDefaults(
  defineProps<{
    show: boolean
    category?: MaterialCategory
    currentUrl?: string
  }>(),
  {
    category: 'image2d',
    currentUrl: ''
  }
)

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'select', item: MaterialItem): void
}>()

const loading = ref(false)
const keyword = ref('')
const list = ref<MaterialItem[]>([])

const thumbOf = (item: MaterialItem) => item.thumb || item.url

const fetchList = async () => {
  loading.value = true
  try {
    const res = await materialListApi({
      category: props.category,
      keyword: keyword.value,
      page: 1,
      limit: 100
    })
    list.value = res?.data || []
  } finally {
    loading.value = false
  }
}

const select = (item: MaterialItem) => {
  emit('select', item)
  emit('update:show', false)
}

watch(
  () => props.show,
  value => {
    if (value) {
      keyword.value = ''
      fetchList()
    }
  }
)
</script>

<style lang="scss" scoped>
.picker-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  max-height: 420px;
  overflow-y: auto;
  padding: 2px;
}

.picker-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;

  &:hover,
  &.is-active {
    border-color: var(--primary-color);
  }
}

.picker-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 90px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
}

.picker-name {
  font-size: 12px;
}

.picker-empty {
  grid-column: 1 / -1;
  padding: 40px 0;
}
</style>
