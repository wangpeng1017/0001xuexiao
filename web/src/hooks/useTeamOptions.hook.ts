import { ref } from 'vue'
import { teamListApi } from '@/api/path'
import type { TeamItem } from '@/api/path/team'

export const useTeamOptions = () => {
  const teams = ref<TeamItem[]>([])
  const loading = ref(false)

  const fetchTeams = async () => {
    loading.value = true
    try {
      const res = await teamListApi()
      teams.value = res?.data || []
    } finally {
      loading.value = false
    }
  }

  return { teams, loading, fetchTeams }
}
