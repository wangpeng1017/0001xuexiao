export interface TeamItem {
  id: string
  name: string
  leaderId: string
  leaderName: string
  memberCount: number
  createTime: string
}

export interface TeamMemberItem {
  userId: string
  username: string
  nickname: string
  role: string
}

export interface TeamDetail extends TeamItem {
  members: TeamMemberItem[]
}

export interface UserOption {
  id: string
  username: string
  nickname: string
  role: string
}
