<template>
  <div class="go-template-library">
    <n-card :bordered="false" class="library-card">
      <div class="toolbar">
        <div class="toolbar-title">
          <span class="title">模板库</span>
          <span class="desc">选择模板快速创建大屏，完整复制模板内容</span>
        </div>
        <n-button secondary :loading="loading" @click="fetchTemplates">刷新</n-button>
      </div>

      <n-spin :show="loading">
        <div v-for="group in groups" :key="group.value" class="category-group">
          <div class="group-title">
            <n-text strong>{{ group.label }}</n-text>
            <n-text depth="3" class="group-count">{{ group.items.length }} 个模板</n-text>
          </div>
          <div class="template-grid">
            <n-card
              v-for="item in group.items"
              :key="item.id"
              size="small"
              hoverable
              class="template-card"
            >
              <div class="template-thumb">
                <n-image
                  v-if="item.indexImage"
                  object-fit="contain"
                  height="150"
                  preview-disabled
                  :src="item.indexImage"
                  :fallback-src="requireErrorImg()"
                />
                <n-icon v-else size="42" depth="3"><AlbumsIcon /></n-icon>
              </div>
              <div class="template-info">
                <n-text class="template-name go-ellipsis-1">{{ item.projectName }}</n-text>
                <n-text depth="3" class="template-meta">
                  {{ item.updateUserName || item.createUserName }} ·
                  {{ formatTime(item.updateTime) }}
                </n-text>
              </div>
              <template #footer>
                <n-button type="primary" secondary block @click="openUse(item)">
                  使用此模板
                </n-button>
              </template>
            </n-card>
          </div>
        </div>

        <n-empty v-if="!loading && templates.length === 0" description="暂无场景模板" />
      </n-spin>
    </n-card>

    <n-modal v-model:show="useShow" preset="card" title="从模板新建" style="width: 460px">
      <n-space vertical size="large">
        <n-text depth="3">
          模板：{{ selected?.projectName }}
        </n-text>
        <n-form-item label="项目名称" :show-feedback="false">
          <n-input
            v-model:value.trim="projectName"
            maxlength="50"
            show-count
            placeholder="请输入项目名称"
          />
        </n-form-item>
        <n-form-item label="项目归属" :show-feedback="false">
          <n-select
            v-model:value="teamId"
            :options="ownerOptions"
            :loading="teamsLoading"
            placeholder="个人"
          />
        </n-form-item>
      </n-space>
      <template #footer>
        <n-space justify="end">
          <n-button @click="useShow = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="confirmUse">创建并打开</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { createFromTemplateApi, projectTemplatesApi } from '@/api/path'
import type { ProjectItem } from '@/api/path/project'
import { ChartEnum } from '@/enums/pageEnum'
import { ResultEnum } from '@/enums/httpEnum'
import { fetchPathByName, requireErrorImg, routerTurnByPath } from '@/utils'
import { icon } from '@/plugins'
import { useTeamOptions } from '@/hooks'
import { TEMPLATE_CATEGORY_OPTIONS } from './category'

const { AlbumsIcon } = icon.ionicons5
const loading = ref(false)
const templates = ref<ProjectItem[]>([])
const useShow = ref(false)
const selected = ref<ProjectItem | null>(null)
const projectName = ref('')
const teamId = ref('')
const creating = ref(false)

const { teams, loading: teamsLoading, fetchTeams } = useTeamOptions()
const ownerOptions = computed(() => [
  { label: '个人', value: '' },
  ...teams.value.map(team => ({ label: `团队：${team.name}`, value: team.id }))
])

const groups = computed(() => {
  return TEMPLATE_CATEGORY_OPTIONS.map(option => ({
    ...option,
    items: templates.value.filter(
      item => (item.templateCategory || 'other') === option.value
    )
  })).filter(group => group.items.length > 0)
})

const formatTime = (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-')
const fetchTemplates = async () => {
  loading.value = true
  try {
    const res = await projectTemplatesApi()
    templates.value = res?.data || []
  } finally {
    loading.value = false
  }
}

const openUse = (item: ProjectItem) => {
  selected.value = item
  const suffix = '（副本）'
  projectName.value =
    item.projectName.length + suffix.length > 50
      ? `${item.projectName.slice(0, 50 - suffix.length)}${suffix}`
      : `${item.projectName}${suffix}`
  teamId.value = ''
  useShow.value = true
  fetchTeams()
}

const confirmUse = async () => {
  if (!selected.value) return
  if (!projectName.value) {
    window['$message'].warning('请输入项目名称')
    return
  }
  creating.value = true
  try {
    const res = await createFromTemplateApi({
      templateId: selected.value.id,
      projectName: projectName.value,
      ...(teamId.value ? { teamId: teamId.value } : {})
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success('创建成功')
      useShow.value = false
      const path = fetchPathByName(ChartEnum.CHART_HOME_NAME, 'href')
      routerTurnByPath(path, [res.data.id], undefined, true)
      return
    }
    window['$message'].error('创建失败')
  } finally {
    creating.value = false
  }
}

onMounted(fetchTemplates)
</script>

<style lang="scss" scoped>
.go-template-library {
  padding: 20px;
}

.library-card {
  border-radius: 8px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.toolbar-title {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .title {
    font-size: 18px;
    font-weight: 600;
  }

  .desc {
    font-size: 12px;
    opacity: 0.65;
  }
}

.category-group {
  margin-top: 20px;
}

.group-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.group-count {
  font-size: 12px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

.template-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 160px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
}

.template-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.template-name {
  font-weight: 500;
}

.template-meta {
  font-size: 12px;
}
</style>
