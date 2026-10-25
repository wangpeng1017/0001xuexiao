<template>
  <div class="go-formats">
    <n-card :bordered="false" class="manage-card">
      <div class="formats-head">
        <div>
          <div class="total">共支持 {{ total }} 种数据格式</div>
          <div class="desc">
            来自服务器上的 GDAL/OGR 驱动列表，并内置 LAS/LAZ、glTF/GLB、3D Tiles 等三维格式。
          </div>
        </div>
        <n-input
          v-model:value.trim="keyword"
          clearable
          placeholder="搜索格式名称或代码"
          style="width: 280px"
        >
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
      </div>

      <n-spin :show="loading">
        <div v-if="filteredGroups.length === 0 && !loading" class="empty">
          没有匹配的数据格式
        </div>
        <section v-for="group in filteredGroups" :key="group.name" class="format-group">
          <div class="group-title">
            <span>{{ group.name }}</span>
            <n-tag size="small" :bordered="false">{{ group.items.length }} 种</n-tag>
          </div>
          <div class="format-list">
            <div v-for="item in group.items" :key="item.code" class="format-item">
              <span class="code">{{ item.code }}</span>
              <span class="name">{{ item.name }}</span>
            </div>
          </div>
        </section>
      </n-spin>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { SearchOutline } from '@vicons/ionicons5'
import { dataFileFormatsApi } from '../api'
import type { FormatGroup } from '../types'

const loading = ref(false)
const keyword = ref('')
const groups = ref<FormatGroup[]>([])

const total = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))

const filteredGroups = computed(() => {
  const query = keyword.value.toLowerCase()
  if (!query) return groups.value
  return groups.value
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
      )
    }))
    .filter((group) => group.items.length > 0)
})

onMounted(async () => {
  loading.value = true
  try {
    const res = await dataFileFormatsApi()
    if (res && res.code === 200 && res.data) {
      groups.value = res.data.groups || []
    } else if (res?.msg) {
      window['$message'].error(res.msg)
    }
  } finally {
    loading.value = false
  }
})
</script>

<style lang="scss" scoped>
.go-formats {
  padding: 16px;
  .manage-card {
    border-radius: 10px;
  }
  .formats-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 20px;
    .total {
      font-size: 22px;
      font-weight: 700;
    }
    .desc {
      margin-top: 6px;
      color: #8a8f99;
      font-size: 12px;
    }
  }
  .empty {
    padding: 40px 0;
    text-align: center;
    color: #8a8f99;
  }
  .format-group {
    margin-bottom: 22px;
    .group-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      font-weight: 600;
    }
    .format-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 8px;
    }
    .format-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(128, 128, 128, 0.08);
      min-width: 0;
      .code {
        font-weight: 600;
        font-size: 13px;
      }
      .name {
        color: #8a8f99;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
}
</style>
