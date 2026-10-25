<template>
  <n-modal
    v-model:show="showRef"
    preset="card"
    :title="$t('project.create_tip')"
    style="width: 720px"
    :bordered="false"
    @afterLeave="closeHandle"
  >
    <n-space vertical size="large">
      <n-form-item label="项目归属" :show-feedback="false">
        <n-select
          v-model:value="teamId"
          :options="ownerOptions"
          :loading="teamsLoading"
          placeholder="个人"
        />
      </n-form-item>

      <n-space v-if="!templateMode" justify="center">
        <n-button size="large" :loading="creating" @click="createBlank">
          <template #icon>
            <n-icon size="18"><FishIcon /></n-icon>
          </template>
          空白大屏
        </n-button>
        <n-button size="large" type="primary" @click="openTemplateMode">
          <template #icon>
            <n-icon size="18"><AlbumsIcon /></n-icon>
          </template>
          从模板新建
        </n-button>
      </n-space>

      <template v-else>
        <div class="template-head">
          <n-text strong>选择模板</n-text>
          <n-button text @click="backToBlank">返回</n-button>
        </div>
        <n-spin :show="templatesLoading">
          <div class="template-grid">
            <n-card
              v-for="item in templates"
              :key="item.id"
              size="small"
              hoverable
              class="template-card"
              :class="{ 'is-active': selectedTemplate?.id === item.id }"
              @click="selectTemplate(item)"
            >
              <div class="template-thumb">
                <n-image
                  v-if="item.indexImage"
                  object-fit="contain"
                  height="90"
                  width="240"
                  preview-disabled
                  :src="item.indexImage"
                />
                <n-icon v-else size="30" depth="3"><AlbumsIcon /></n-icon>
              </div>
              <n-ellipsis class="template-name">{{ item.projectName }}</n-ellipsis>
              <n-tag size="tiny" :bordered="false" type="info">
                {{ templateCategoryLabel(item.templateCategory) }}
              </n-tag>
            </n-card>
            <n-empty
              v-if="!templates.length && !templatesLoading"
              description="暂无模板"
              class="template-empty"
            />
          </div>
        </n-spin>

        <template v-if="selectedTemplate">
          <n-input
            v-model:value.trim="projectName"
            maxlength="50"
            show-count
            placeholder="请输入项目名称"
          />
          <n-space justify="end">
            <n-button type="primary" :loading="creating" @click="createFromTemplate">
              创建并打开
            </n-button>
          </n-space>
        </template>
      </template>
    </n-space>
  </n-modal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { icon } from '@/plugins'
import { ChartEnum } from '@/enums/pageEnum'
import { ResultEnum } from '@/enums/httpEnum'
import { fetchPathByName, routerTurnByPath, getUUID } from '@/utils'
import {
  createProjectApi,
  createFromTemplateApi,
  projectTemplatesApi
} from '@/api/path'
import type { ProjectItem } from '@/api/path/project'
import { useTeamOptions } from '@/hooks'
import { templateCategoryLabel } from '@/views/project/template/category'

const { FishIcon, AlbumsIcon } = icon.ionicons5
const showRef = ref(false)

const emit = defineEmits(['close'])
const props = defineProps({
  show: Boolean
})

const { teams, loading: teamsLoading, fetchTeams } = useTeamOptions()
const teamId = ref<string>('')
const ownerOptions = computed(() => [
  { label: '个人', value: '' },
  ...teams.value.map(team => ({ label: `团队：${team.name}`, value: team.id }))
])

const creating = ref(false)
const templateMode = ref(false)
const templatesLoading = ref(false)
const templates = ref<ProjectItem[]>([])
const selectedTemplate = ref<ProjectItem | null>(null)
const projectName = ref('')

watch(
  () => props.show,
  newValue => {
    showRef.value = newValue
    if (newValue) {
      templateMode.value = false
      selectedTemplate.value = null
      projectName.value = ''
      teamId.value = ''
      fetchTeams()
    }
  }
)

// 关闭对话框
const closeHandle = () => {
  emit('close', false)
}

const openTemplateMode = async () => {
  templateMode.value = true
  templatesLoading.value = true
  try {
    const res = await projectTemplatesApi()
    templates.value = res?.data || []
  } finally {
    templatesLoading.value = false
  }
}

const backToBlank = () => {
  templateMode.value = false
  selectedTemplate.value = null
  projectName.value = ''
}

const selectTemplate = (item: ProjectItem) => {
  selectedTemplate.value = item
  const suffix = '（副本）'
  projectName.value =
    item.projectName.length + suffix.length > 50
      ? `${item.projectName.slice(0, 50 - suffix.length)}${suffix}`
      : `${item.projectName}${suffix}`
}

const openEditor = (id: string) => {
  const path = fetchPathByName(ChartEnum.CHART_HOME_NAME, 'href')
  routerTurnByPath(path, [id], undefined, true)
  closeHandle()
}

// 新建空白项目
const createBlank = async () => {
  creating.value = true
  try {
    const res = await createProjectApi({
      projectName: getUUID(),
      ...(teamId.value ? { teamId: teamId.value } : {})
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success(window['$t']('project.create_success'))
      openEditor(res.data.id)
      return
    }
    window['$message'].error(window['$t']('project.create_failure'))
  } catch (error) {
    window['$message'].error(window['$t']('project.create_failure'))
  } finally {
    creating.value = false
  }
}

// 从模板新建
const createFromTemplate = async () => {
  if (!selectedTemplate.value) return
  if (!projectName.value) {
    window['$message'].warning('请输入项目名称')
    return
  }
  creating.value = true
  try {
    const res = await createFromTemplateApi({
      templateId: selectedTemplate.value.id,
      projectName: projectName.value,
      ...(teamId.value ? { teamId: teamId.value } : {})
    })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success(window['$t']('project.create_success'))
      openEditor(res.data.id)
      return
    }
    window['$message'].error(window['$t']('project.create_failure'))
  } catch (error) {
    window['$message'].error(window['$t']('project.create_failure'))
  } finally {
    creating.value = false
  }
}
</script>

<style lang="scss" scoped>
.template-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
  padding: 2px;
}

.template-card {
  cursor: pointer;
  border: 1px solid transparent;

  &.is-active {
    border-color: var(--primary-color);
  }
}

.template-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 90px;
  margin-bottom: 6px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
}

.template-name {
  margin-bottom: 4px;
  font-size: 13px;
}

.template-empty {
  grid-column: 1 / -1;
  padding: 30px 0;
}
</style>
