// ═══════════════════════════════════════════════════════════════
// 文件头说明（应用级全局 Store：群组上下文）
// ───────────────────────────────────────────────────────────────
// ① 职责与所属路由：
//    跨页面共享的「群组上下文」状态：当前选中群组、我拥有的群组、
//    我加入的群组、待处理邀请。被 /app/groups、/app/documents、/app/qa、
//    /app/assistant 等工作区页面共同读写，保证页面切换时选中群组不丢失。
// ② 依赖的 api / store：
//    类型依赖 ../api/group（GroupItem / PendingInvitationItem）；
//    本 store 不直接调用接口，由页面把查询结果通过 actions 写入。
// ③ 主要数据流 / 交互：
//    页面查询群组后调用 applyGroupQueryResult 写入三份集合并自动校正
//    currentGroupId（原选中群组不可见时回落到拥有/加入列表的第一个）；
//    visibleGroups / currentGroup getter 统一附加 relation 供 UI 区分身份；
//    登出或加载异常时 resetGroupContext 清空上下文。
// ④ 父子组件关系：
//    无 UI；作为 Pinia 全局单例被各工作区页面组件注入使用。
// ═══════════════════════════════════════════════════════════════
import { defineStore } from 'pinia'
import type { GroupItem, PendingInvitationItem } from '../api/group'

// 用户与群组的关系：OWNER（创建者，可管理）/ MEMBER（普通成员）
export type GroupRelation = 'OWNER' | 'MEMBER'

// 列表展示用的群组视图：在 GroupItem 基础上附加 relation，UI 据此区分「我拥有的 / 我加入的」
export interface VisibleGroup extends GroupItem {
  relation: GroupRelation
}

// store 状态结构
interface AppState {
  // 当前选中的群组 ID（null 表示未选择，业务页据此展示「请先选择群组」类提示）
  currentGroupId: number | null
  // 我创建/拥有的群组列表
  ownedGroups: GroupItem[]
  // 我作为成员加入的群组列表
  joinedGroups: GroupItem[]
  // 待处理的群组邀请（审批用）
  pendingInvitations: PendingInvitationItem[]
  // 群组集合是否加载中：供页面骨架屏 / spinner 使用
  isGroupsLoading: boolean
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    currentGroupId: null,
    ownedGroups: [],
    joinedGroups: [],
    pendingInvitations: [],
    isGroupsLoading: false,
  }),
  getters: {
    // 拥有 + 加入合并后的可见群组列表，统一带上 OWNER/MEMBER 身份标记
    visibleGroups(state): VisibleGroup[] {
      return [
        ...state.ownedGroups.map((group) => ({ ...group, relation: 'OWNER' as const })),
        ...state.joinedGroups.map((group) => ({ ...group, relation: 'MEMBER' as const })),
      ]
    },
    // 当前选中群组的完整视图对象；未选择或已不在可见列表中时返回 null
    currentGroup(state): VisibleGroup | null {
      const visibleGroups = [
        ...state.ownedGroups.map((group) => ({ ...group, relation: 'OWNER' as const })),
        ...state.joinedGroups.map((group) => ({ ...group, relation: 'MEMBER' as const })),
      ]
      return visibleGroups.find((group) => group.groupId === state.currentGroupId) ?? null
    },
    // 是否有权管理当前群组：仅 OWNER 可管理（控制编辑/成员管理等按钮显隐）
    canManageCurrentGroup(): boolean {
      return this.currentGroup?.relation === 'OWNER'
    },
  },
  actions: {
    // 仅切换选中群组（切换后 document/qa/assistant 等页面的数据范围随之变化）
    setCurrentGroupId(groupId: number | null) {
      this.currentGroupId = groupId
    },
    // 原子写入三份群组集合（不校正 currentGroupId，由调用方自行决定）
    setGroupCollections(payload: {
      ownedGroups: GroupItem[]
      joinedGroups: GroupItem[]
      pendingInvitations: PendingInvitationItem[]
    }) {
      this.ownedGroups = payload.ownedGroups
      this.joinedGroups = payload.joinedGroups
      this.pendingInvitations = payload.pendingInvitations
    },
    // 页面查询结果的标准入口：写入集合的同时校正选中群组——
    // 可见群组为空则清空选择；原选中群组仍可见则保持不变；
    // 否则回落到拥有列表的第一个（其次加入列表的第一个），保证业务页始终有默认群组
    applyGroupQueryResult(payload: {
      ownedGroups: GroupItem[]
      joinedGroups: GroupItem[]
      pendingInvitations: PendingInvitationItem[]
    }) {
      this.setGroupCollections(payload)
      const visibleGroupIds = new Set([
        ...payload.ownedGroups.map((group) => group.groupId),
        ...payload.joinedGroups.map((group) => group.groupId),
      ])
      if (visibleGroupIds.size === 0) {
        this.currentGroupId = null
        return
      }
      if (this.currentGroupId !== null && visibleGroupIds.has(this.currentGroupId)) {
        return
      }
      this.currentGroupId = payload.ownedGroups[0]?.groupId ?? payload.joinedGroups[0]?.groupId ?? null
    },
    // 清空整个群组上下文（登出 / 加载失败时调用）；isLoading 参数允许清空后立即进入加载态
    resetGroupContext(isLoading = false) {
      this.currentGroupId = null
      this.ownedGroups = []
      this.joinedGroups = []
      this.pendingInvitations = []
      this.isGroupsLoading = isLoading
    },
    // 单独切换群组集合的加载态（与 resetGroupContext 解耦，便于局部刷新）
    setGroupsLoading(isLoading: boolean) {
      this.isGroupsLoading = isLoading
    },
  },
})
