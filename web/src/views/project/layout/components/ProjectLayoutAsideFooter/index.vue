<template>
  <div class="go-aside-footer">
    <n-text depth="3" class="footer-text">
      {{ collapsed ? '融合可视' : '多源数据融合可视化平台' }}
    </n-text>
  </div>
</template>

<script setup lang="ts">
defineProps({
  collapsed: Boolean
})
</script>

<style lang="scss" scoped>
@include go('aside-footer') {
  padding: 16px 10px 20px;
  text-align: center;
  .footer-text {
    font-size: 12px;
    letter-spacing: 1px;
  }
}
</style>
