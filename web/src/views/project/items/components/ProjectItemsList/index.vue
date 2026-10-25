<template>
  <div class="go-items-list">
    <!-- 筛选 -->
    <div class="list-toolbar">
      <n-radio-group v-model:value="scope" @update:value="changeScope">
        <n-radio-button value="mine">我的</n-radio-button>
        <n-radio-button value="team">团队</n-radio-button>
        <n-radio-button v-if="isAdmin" value="all">全部</n-radio-button>
      </n-radio-group>
      <n-select
        v-if="scope === 'team'"
        v-model:value="teamId"
        :options="teamOptions"
        placeholder="选择团队"
        style="width: 220px"
        clearable
        @update:value="changeTeam"
      />
    </div>
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
            @template="handleTemplate"
          ></project-items-card>
        </template>
      </draggable>
      <n-empty
        v-if="!list.length"
        :description="scope === 'team' && !teamId ? '请先选择团队' : '暂无大屏项目'"
        class="empty-box"
      />
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

  <!-- 设为模板 -->
  <n-modal v-model:show="templateShow" preset="card" title="设为模板" style="width: 420px">
    <n-space vertical>
      <n-text depth="3">
        模板会出现在“模板库”中，所有登录用户都可以基于它新建大屏。
      </n-text>
      <n-select v-model:value="templateCategory" :options="templateCategoryOptions" />
    </n-space>
    <template #footer>
      <n-space justify="end">
        <n-button @click="templateShow = false">取消</n-button>
        <n-button type="primary" :loading="templateSaving" @click="confirmTemplate">
          确定
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NRadioButton } from 'naive-ui'
import draggable from 'vuedraggable'
import { ProjectItemsCard } from '../ProjectItemsCard/index'
import { ProjectItemsModalCard } from '../ProjectItemsModalCard/index'
import { useModalDataInit } from './hooks/useModal.hook'
import { useDataListInit } from './hooks/useData.hook'
import { TEMPLATE_CATEGORY_OPTIONS } from '../../../template/category'
import type { Chartype } from '../../index.d'

const { modalData, modalShow, closeModal, previewHandle, resizeHandle, editHandle } = useModalDataInit()
const {
  loading,
  paginat,
  list,
  scope,
  teamId,
  isAdmin,
  teamOptions,
  changeSize,
  changePage,
  changeScope,
  changeTeam,
  releaseHandle,
  deleteHandle,
  copyHandle,
  renameHandle,
  setTemplateHandle,
  sortStartHandle,
  sortEndHandle
} = useDataListInit()

const renameShow = ref(false)
const renaming = ref(false)
const renameName = ref('')
const renameTarget = ref<Chartype | null>(null)

const templateShow = ref(false)
const templateSaving = ref(false)
const templateTarget = ref<Chartype | null>(null)
const templateCategory = ref('campus')
const templateCategoryOptions = TEMPLATE_CATEGORY_OPTIONS

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

const handleTemplate = async (cardData: Chartype) => {
  if (cardData.isTemplate) {
    await setTemplateHandle(cardData, false)
    return
  }
  templateTarget.value = cardData
  templateCategory.value = 'campus'
  templateShow.value = true
}

const confirmTemplate = async () => {
  if (!templateTarget.value) return
  templateSaving.value = true
  try {
    const ok = await setTemplateHandle(
      templateTarget.value,
      true,
      templateCategory.value
    )
    if (ok) templateShow.value = false
  } finally {
    templateSaving.value = false
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

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
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
