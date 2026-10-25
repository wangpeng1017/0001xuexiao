export const TEMPLATE_CATEGORY_OPTIONS = [
  { label: '校园三维', value: 'campus' },
  { label: '设备监控', value: 'device' },
  { label: '数据统计', value: 'data' },
  { label: '其他', value: 'other' }
]

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  campus: '校园三维',
  device: '设备监控',
  data: '数据统计',
  other: '其他'
}

export const templateCategoryLabel = (value?: string) => {
  if (!value) return '其他'
  return TEMPLATE_CATEGORY_LABELS[value] || value
}
