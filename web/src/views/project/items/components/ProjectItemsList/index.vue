<template>
  <div class="go-items-list">
    <!-- 加载 -->
    <div v-show="loading">
      <go-loading></go-loading>
    </div>
    <!-- 列表 -->
    <div v-show="!loading">
      <draggable
        v-model="list"
        item-key="id"
        tag="div"
        class="items-grid"
        :animation="200"
        ghost-class="sortable-ghost"
        @start="sortStartHandle"
        @end="sortEndHandle"
      >
        <template #item="{ element }">
          <project-items-card
            :cardData="element"
            @preview="previewHandle"
            @resize="resizeHandle"
            @delete="deleteHandle(element)"
            @release="releaseHandle(element)"
            @edit="editHandle"
            @copy="copyHandle(element)"
            @rename="openRename(element)"
          ></project-items-card>
        </template>
      </draggable>
      <n-empty v-if="!list.length" description="暂无大屏项目" class="empty-box" />
    </div>

    <!-- 分页 -->
    <div class="list-pagination">
      <n-pagination
        :page="paginat.page"
        :page-size="paginat.limit"
        :item-count="paginat.count"
        :page-sizes="[12, 24, 36, 48]"
        @update:page="changePage"
        @update:page-size="changeSize"
        show-size-picker
      />
    </div>
  </div>

  <!-- 预览大图 -->
  <project-items-modal-card
    v-if="modalData"
    :modalShow="modalShow"
    :cardData="modalData"
    @close="closeModal"
    @edit="editHandle"
  ></project-items-modal-card>

  <!-- 重命名 -->
  <n-modal v-model:show="renameShow" preset="card" title="重命名项目" style="width: 420px">
    <n-input
      v-model:value.trim="renameName"
      maxlength="50"
      show-count
      placeholder="请输入项目名称"
      @keyup.enter="confirmRename"
    />
    <template #footer>
      <n-space justify="end">
        <n-button @click="renameShow = false">取消</n-button>
        <n-button type="primary" :loading="renaming" @click="confirmRename">确定</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import draggable from 'vuedraggable'
import { ProjectItemsCard } from '../ProjectItemsCard/index'
import { ProjectItemsModalCard } from '../ProjectItemsModalCard/index'
import { useModalDataInit } from './hooks/useModal.hook'
import { useDataListInit } from './hooks/useData.hook'
import type { Chartype } from '../../index.d'

const { modalData, modalShow, closeModal, previewHandle, resizeHandle, editHandle } = useModalDataInit()
const {
  loading,
  paginat,
  list,
  changeSize,
  changePage,
  releaseHandle,
  deleteHandle,
  copyHandle,
  renameHandle,
  sortStartHandle,
  sortEndHandle
} = useDataListInit()

const renameShow = ref(false)
const renaming = ref(false)
const renameName = ref('')
const renameTarget = ref<Chartype | null>(null)

const openRename = (cardData: Chartype) => {
  renameTarget.value = cardData
  renameName.value = cardData.title
  renameShow.value = true
}

const confirmRename = async () => {
  if (!renameTarget.value) return
  if (!renameName.value) {
    window['$message'].warning('项目名称不能为空')
    return
  }
  renaming.value = true
  try {
    const ok = await renameHandle(renameTarget.value, renameName.value)
    if (ok) renameShow.value = false
  } finally {
    renaming.value = false
  }
}
</script>

<style lang="scss" scoped>
$contentHeight: 250px;
@include go('items-list') {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: calc(100vh - #{$--header-height} - 40px - 2px);
  .list-content {
    position: relative;
    height: $contentHeight;
  }
  .list-pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  align-items: stretch;
}

.empty-box {
  padding: 60px 0;
}

:deep(.sortable-ghost) {
  opacity: 0.4;
}
</style>
