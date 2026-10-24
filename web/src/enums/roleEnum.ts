import type { UserRole } from '@/store/modules/systemStore/systemStore.d'

export const RoleEnum = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student'
} as const

export const roleLabelMap: Record<UserRole, string> = {
  admin: '管理员',
  teacher: '教师',
  student: '学生'
}

export const roleOptions = [
  { label: roleLabelMap.admin, value: RoleEnum.ADMIN },
  { label: roleLabelMap.teacher, value: RoleEnum.TEACHER },
  { label: roleLabelMap.student, value: RoleEnum.STUDENT }
]
