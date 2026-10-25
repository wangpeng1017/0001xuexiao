<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="isEdit ? '编辑数据集' : '新建数据集'"
    style="width: 680px; max-width: 94vw"
    :bordered="false"
  >
    <n-form label-placement="top" :show-feedback="false">
      <div class="grid">
        <n-form-item label="名称">
          <n-input v-model:value="form.name" placeholder="例如：校园温度传感器" maxlength="50" />
        </n-form-item>
        <n-form-item label="类型">
          <n-select v-model:value="form.type" :options="typeOptions" :disabled="isEdit" />
        </n-form-item>
      </div>

      <template v-if="form.type === 'http'">
        <n-form-item label="请求地址">
          <n-input v-model:value="form.url" placeholder="http://192.168.1.10/api/sensors" />
        </n-form-item>
        <div class="grid">
          <n-form-item label="请求方法">
            <n-select v-model:value="form.method" :options="methodOptions" />
          </n-form-item>
          <n-form-item label="JSON 取值路径（可选）">
            <n-input v-model:value="form.dataPath" placeholder="例如 data.list" />
          </n-form-item>
        </div>
        <n-form-item label="请求头（JSON 对象）">
          <n-input
            v-model:value="form.headersText"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 5 }"
            placeholder='{"Authorization": "Bearer xxx"}'
          />
        </n-form-item>
        <n-form-item label="请求体（POST 时生效）">
          <n-input
            v-model:value="form.body"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 5 }"
            placeholder="JSON 字符串，例如 {&quot;page&quot;: 1}"
          />
        </n-form-item>
      </template>

      <template v-else>
        <div class="grid grid-3">
          <n-form-item label="主机">
            <n-input v-model:value="form.host" placeholder="127.0.0.1" />
          </n-form-item>
          <n-form-item label="端口">
            <n-input-number v-model:value="form.port" :min="1" :max="65535" style="width: 100%" />
          </n-form-item>
          <n-form-item label="数据库">
            <n-input v-model:value="form.database" placeholder="school" />
          </n-form-item>
        </div>
        <div class="grid">
          <n-form-item label="用户名">
            <n-input v-model:value="form.user" placeholder="reader" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              :placeholder="isEdit ? '留空表示不修改' : '数据库密码'"
            />
          </n-form-item>
        </div>
        <n-form-item label="查询 SQL（只允许单条 SELECT / WITH ... SELECT）">
          <n-input
            v-model:value="form.sql"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 10 }"
            placeholder="SELECT * FROM students LIMIT 100"
          />
        </n-form-item>
      </template>
    </n-form>

    <template #footer>
      <n-space justify="end">
        <n-button @click="visible = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ResultEnum } from '@/enums/httpEnum'
import { datasetCreateApi, datasetEditApi } from '../../api'
import type { DatasetConfig, DatasetItem, DatasetType } from '../../types'

const props = defineProps<{
  show: boolean
  dataset: DatasetItem | null
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
  (event: 'success'): void
}>()

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})
const isEdit = computed(() => Boolean(props.dataset))
const saving = ref(false)

const typeOptions = [
  { label: 'RESTful API（HTTP）', value: 'http' },
  { label: 'MySQL 数据库', value: 'mysql' }
]
const methodOptions = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' }
]

const form = reactive({
  name: '',
  type: 'http' as DatasetType,
  url: '',
  method: 'GET' as 'GET' | 'POST',
  dataPath: '',
  headersText: '{}',
  body: '',
  host: '',
  port: 3306 as number | null,
  database: '',
  user: '',
  password: '',
  sql: ''
})

watch(
  () => props.show,
  (show) => {
    if (!show) return
    if (props.dataset) {
      const dataset = props.dataset
      form.name = dataset.name
      form.type = dataset.type
      if (dataset.type === 'http') {
        const config = dataset.config as {
          url: string
          method: 'GET' | 'POST'
          headers: Record<string, string>
          body: string
          dataPath: string
        }
        form.url = config.url
        form.method = config.method
        form.dataPath = config.dataPath
        form.headersText = JSON.stringify(config.headers || {}, null, 2)
        form.body = config.body || ''
      } else {
        const config = dataset.config as {
          host: string
          port: number
          database: string
          user: string
          sql: string
        }
        form.host = config.host
        form.port = config.port
        form.database = config.database
        form.user = config.user
        form.password = ''
        form.sql = config.sql
      }
    } else {
      Object.assign(form, {
        name: '',
        type: 'http',
        url: '',
        method: 'GET',
        dataPath: '',
        headersText: '{}',
        body: '',
        host: '',
        port: 3306,
        database: '',
        user: '',
        password: '',
        sql: ''
      })
    }
  },
  { immediate: true }
)

function buildConfig(): DatasetConfig | null {
  if (form.type === 'http') {
    let headers: Record<string, string> = {}
    try {
      const parsed = JSON.parse(form.headersText || '{}')
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('headers')
      }
      headers = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)])
      )
    } catch {
      window['$message'].error('请求头必须是合法的 JSON 对象')
      return null
    }
    return {
      url: form.url.trim(),
      method: form.method,
      headers,
      body: form.body,
      dataPath: form.dataPath.trim()
    }
  }
  return {
    host: form.host.trim(),
    port: Number(form.port || 3306),
    database: form.database.trim(),
    user: form.user.trim(),
    password: form.password,
    sql: form.sql
  }
}

async function handleSave() {
  if (!form.name.trim()) {
    window['$message'].error('请输入数据集名称')
    return
  }
  const config = buildConfig()
  if (!config) return
  saving.value = true
  try {
    const res = props.dataset
      ? await datasetEditApi({ id: props.dataset.id, name: form.name.trim(), config })
      : await datasetCreateApi({ name: form.name.trim(), type: form.type, config })
    if (res && res.code === ResultEnum.SUCCESS) {
      window['$message'].success(isEdit.value ? '已保存' : '已创建')
      visible.value = false
      emit('success')
    } else if (res?.msg) {
      window['$message'].error(res.msg)
    }
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
  &.grid-3 {
    grid-template-columns: 1.2fr 0.7fr 1.2fr;
  }
}
</style>
