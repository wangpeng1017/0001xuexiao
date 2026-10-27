<template>
  <div v-if="cardData" class="go-items-list-card">
    <n-card hoverable size="small">
      <div class="list-content">
        <!-- 顶部按钮 -->
        <div class="list-content-top">
          <mac-os-control-btn
            class="top-btn"
            :hidden="['remove']"
            @close="deleteHandle"
            @resize="resizeHandle"
         ></mac-os-control-btn>
        </div>
        <!-- 中间 -->
        <div class="list-content-img" @click="resizeHandle">
          <div v-if="!cardData.image" class="list-content-empty">
            <n-text depth="3">暂无封面</n-text>
            <n-text depth="3" class="list-content-empty-tip">在编辑器里保存后自动生成</n-text>
          </div>
          <n-image
            v-else
            object-fit="contain"
            height="180"
            preview-disabled
            :src="imageUrl"
            :alt="cardData.title"
            :fallback-src="requireErrorImg()"
         ></n-image>
        </div>
      </div>
      <template #action>
        <div class="list-footer">
          <div class="list-footer-top">
            <div class="list-title-wrap">
              <n-text class="list-title go-ellipsis-1">
                {{ cardData.title || cardData.id || '未命名' }}
              </n-text>
              <n-tag
                v-if="cardData.isTemplate"
                size="tiny"
                :bordered="false"
                type="info"
              >
                模板
              </n-tag>
            </div>
            <n-text class="list-status">
              <n-badge
                class="go-animation-twinkle"
                dot
                :color="cardData.release ? '#34c749' : '#fcbc40'"
              ></n-badge>
              {{ cardData.release ? $t('project.release') : $t('project.unreleased') }}
            </n-text>
          </div>
          <div class="list-footer-bottom">
            <div class="list-footer-info">
              <n-text depth="3" class="list-meta go-ellipsis-1">
                {{ cardData.teamName ? `团队：${cardData.teamName}` : '个人项目' }}
              </n-text>
              <n-text depth="3" class="list-meta go-ellipsis-1">
                修改：{{ cardData.updateUserName || '-' }}
              </n-text>
              <n-text depth="3" class="list-time">
                {{ formatTime(cardData.time) }}
              </n-text>
            </div>
            <n-space :size="6" :wrap="false">
              <n-tooltip placement="bottom" trigger="hover">
                <template #trigger>
                  <n-button size="small" @click="editHandle">
                    <template #icon>
                      <n-icon><HammerIcon /></n-icon>
                    </template>
                  </n-button>
                </template>
                <span>{{ $t('global.r_edit') }}</span>
              </n-tooltip>
              <n-dropdown
                trigger="click"
                placement="bottom"
                :options="selectOptions"
                :show-arrow="true"
                @select="handleSelect"
              >
                <n-button size="small">
                  <template #icon>
                    <n-icon><EllipsisHorizontalCircleSharpIcon /></n-icon>
                  </template>
                </n-button>
              </n-dropdown>
            </n-space>
          </div>
        </div>
      </template>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, PropType } from 'vue'
import dayjs from 'dayjs'
import { renderIcon, requireErrorImg, getStoredRole } from '@/utils'
import { icon } from '@/plugins'
import { MacOsControlBtn } from '@/components/Tips/MacOsControlBtn'
import { Chartype } from '../../index.d'

const {
  EllipsisHorizontalCircleSharpIcon,
  CopyIcon,
  TrashIcon,
  PencilIcon,
  BrowsersOutlineIcon,
  HammerIcon,
  SendIcon,
  AlbumsIcon
} = icon.ionicons5

const emit = defineEmits(['preview', 'delete', 'resize', 'edit', 'release', 'copy', 'rename', 'template'])

const props = defineProps({
  cardData: Object as PropType<Chartype>
})

const canTemplate = computed(() => {
  const role = getStoredRole()
  return role === 'admin' || role === 'teacher'
})

const imageUrl = computed(() => {
  const image = props.cardData?.image
  if (!image) return requireErrorImg()
  if (/^(data|blob):/.test(image)) return image
  return `${image}${image.includes('?') ? '&' : '?'}time=${Date.now()}`
})

const selectOptions = computed(() => {
  const options: any[] = [
    {
      label: window['$t']('global.r_preview'),
      key: 'preview',
      icon: renderIcon(BrowsersOutlineIcon)
    },
    {
      label: props.cardData?.release
        ? window['$t']('global.r_unpublish')
        : window['$t']('global.r_publish'),
      key: 'release',
      icon: renderIcon(SendIcon)
    },
    {
      label: window['$t']('global.r_copy'),
      key: 'copy',
      icon: renderIcon(CopyIcon)
    },
    {
      label: window['$t']('global.r_rename'),
      key: 'rename',
      icon: renderIcon(PencilIcon)
    }
  ]

  if (canTemplate.value) {
    options.push({
      label: props.cardData?.isTemplate ? '取消模板' : '设为模板',
      key: 'template',
      icon: renderIcon(AlbumsIcon)
    })
  }

  options.push(
    {
      type: 'divider',
      key: 'divider'
    },
    {
      label: window['$t']('global.r_delete'),
      key: 'delete',
      icon: renderIcon(TrashIcon)
    }
  )
  return options
})

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = dayjs(value)
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : '-'
}

const handleSelect = (key: string) => {
  switch (key) {
    case 'preview':
      previewHandle()
      break
    case 'delete':
      deleteHandle()
      break
    case 'release':
      releaseHandle()
      break
    case 'copy':
      emit('copy', props.cardData)
      break
    case 'rename':
      emit('rename', props.cardData)
      break
    case 'template':
      emit('template', props.cardData)
      break
    case 'edit':
      editHandle()
      break
  }
}

// 预览处理
const previewHandle = () => {
  emit('preview', props.cardData)
}

// 删除处理
const deleteHandle = () => {
  emit('delete', props.cardData)
}

// 编辑处理
const editHandle = () => {
  emit('edit', props.cardData)
}

// 发布处理
const releaseHandle = () => {
  emit('release', props.cardData)
}

// 放大处理
const resizeHandle = () => {
  emit('resize', props.cardData)
}
</script>

<style lang="scss" scoped>
$contentHeight: 180px;
@include go('items-list-card') {
  position: relative;
  height: 100%;
  border-radius: $--border-radius-base;
  border: 1px solid rgba(0, 0, 0, 0);
  @extend .go-transition;
  &:hover {
    @include hover-border-color('hover-border-color');
  }
  :deep(.n-card) {
    height: 100%;
  }
  .list-content {
    margin-top: 20px;
    margin-bottom: 5px;
    cursor: pointer;
    border-radius: $--border-radius-base;
    @include background-image('background-point');
    @extend .go-point-bg;
    &-top {
      position: absolute;
      top: 10px;
      left: 10px;
      height: 22px;
    }
    &-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    &-empty-tip {
      font-size: 12px;
    }
    &-img {
      height: $contentHeight;
      @extend .go-flex-center;
      @extend .go-border-radius;
      @include deep() {
        img {
          @extend .go-border-radius;
        }
      }
    }
  }
  .list-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    &-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      line-height: 24px;
    }
    &-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    &-info {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }
  }
}

.list-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.list-time {
  font-size: 12px;
  line-height: 16px;
}


.list-title {
  min-width: 0;
  font-weight: 500;
}

.list-status {
  flex-shrink: 0;
  font-size: 12px;
  white-space: nowrap;
}

.list-meta {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
</style>
