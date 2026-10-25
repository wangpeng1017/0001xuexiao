<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="title"
    style="width: 760px; max-width: 94vw"
    :bordered="false"
  >
    <n-alert v-if="truncated" type="warning" :bordered="false" class="preview-alert">
      数据超过 64KB，已截断显示。
    </n-alert>
    <pre class="preview-json">{{ text }}</pre>
    <template #footer>
      <n-space justify="end">
        <n-button @click="visible = false">关闭</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  show: boolean
  title: string
  data: unknown
  truncated?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
}>()

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})

const text = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2)
  } catch {
    return String(props.data)
  }
})
</script>

<style lang="scss" scoped>
.preview-alert {
  margin-bottom: 10px;
}
.preview-json {
  margin: 0;
  max-height: 55vh;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.1);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
