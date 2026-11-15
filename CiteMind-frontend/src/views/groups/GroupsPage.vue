<script setup lang="ts">
// ============================================================
// 协作小组页 — 路由 /app/groups（/app 默认重定向到此页）
// ------------------------------------------------------------
// 职责：小组协作的调度中心——统计栏、四个 Tab（待处理邀请 /
//   我拥有的组 / 我加入的组 / 我的申请）、创建 / 加入入口，
//   以及小组管理弹窗里的邀请、审批、移除成员等所有业务动作。
//
// 四个 Tab 的数据来源：
//   - 待处理邀请：appStore.pendingInvitations（随 fetchGroups 一并带回）
//   - 我拥有的组 / 我加入的组：appStore.ownedGroups / joinedGroups（同上）
//   - 我的申请：fetchMyJoinRequests（我提交的加入申请）+
//     fetchMySentInvitations（我发出的邀请）两个独立接口
//
// 邀请 / 申请审批流程：
//   ① 收到邀请 → InvitationsTab 里接受(acceptInvitation)/拒绝(rejectInvitation)；
//   ② 我主动申请 → JoinGroupModal 提交组织 ID(submitJoinRequest)，记录进
//      "我的申请"Tab，等待对方所有者在 GroupManageModal 中
//      通过(approveJoinRequest)/拒绝(rejectJoinRequest)；
//   ③ 我是所有者 → GroupManageModal 内邀请成员(createInvitation)、
//      移除成员(removeGroupMember)、审批加入申请。
//   每次写操作成功后统一走 refreshWorkspace() 重新拉取三份数据。
//
// 依赖的 api 模块函数（@/api/group）：fetchGroups / createGroup /
//   createInvitation / acceptInvitation / rejectInvitation / submitJoinRequest /
//   fetchMyJoinRequests / fetchMySentInvitations / fetchGroupMembers /
//   fetchOwnerJoinRequests / approveJoinRequest / rejectJoinRequest /
//   removeGroupMember / leaveGroup；@/api/http：extractApiError。
//
// 父子关系：子 → GroupStatsBar、四个 Tab 组件（InvitationsTab /
//   OwnedGroupsTab / JoinedGroupsTab / MyRequestsTab）、三个弹窗
//   （CreateGroupModal / JoinGroupModal / GroupManageModal）。
// ============================================================
import { computed, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import {
  acceptInvitation,
  approveJoinRequest,
  createGroup,
  createInvitation,
  fetchMyJoinRequests,
  fetchMySentInvitations,
  fetchGroupMembers,
  fetchGroups,
  fetchOwnerJoinRequests,
  leaveGroup,
  rejectInvitation,
  rejectJoinRequest,
  removeGroupMember,
  submitJoinRequest,
  type GroupItem,
  type GroupMemberItem,
  type JoinRequestItem,
  type MySentInvitationItem,
  type OwnerJoinRequestItem,
} from '@/api/group'
import { extractApiError } from '@/api/http'
import PageHeaderHero from '@/components/layout/PageHeaderHero.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import GroupStatsBar from './components/GroupStatsBar.vue'
import InvitationsTab from './components/InvitationsTab.vue'
import OwnedGroupsTab from './components/OwnedGroupsTab.vue'
import JoinedGroupsTab from './components/JoinedGroupsTab.vue'
import MyRequestsTab from './components/MyRequestsTab.vue'
import CreateGroupModal from './components/modals/CreateGroupModal.vue'
import JoinGroupModal from './components/modals/JoinGroupModal.vue'
import GroupManageModal from './components/modals/GroupManageModal.vue'

const appStore = useAppStore()
const authStore = useAuthStore()

// ── Core data ──
// 我拥有 / 我加入的组与待处理邀请：统一放在 appStore，由 fetchGroups 结果写入
const ownedGroups = computed(() => appStore.ownedGroups)
const joinedGroups = computed(() => appStore.joinedGroups)
const pendingInvitations = computed(() => appStore.pendingInvitations)
// "我的申请"Tab 两份数据：我提交的加入申请 / 我发出的邀请（独立接口）
const myJoinRequests = ref<JoinRequestItem[]>([])
const mySentInvitations = ref<MySentInvitationItem[]>([])

// ── Lazily loaded data ──
// 仅在打开管理弹窗（owner 模式）时按需加载：成员列表 / 该组的加入申请
const groupMembers = ref<GroupMemberItem[]>([])
const ownerJoinRequests = ref<OwnerJoinRequestItem[]>([])

// ── UI state ──
// 当前激活 Tab（首屏加载完成后按数据情况决定默认值）
const activeTab = ref<'invitations' | 'owned' | 'joined' | 'requests'>('invitations')
// 首屏加载标记（整页 spinner）
const isInitialLoading = ref(true)
// 操作成功提示 / 错误提示（页面顶部反馈条）
const feedback = ref('')
const error = ref('')

// ── Modal visibility ──
// 三个弹窗开关与被管理的小组；manageMode 区分所有者视图 / 成员视图
const showCreateModal = ref(false)
const showJoinModal = ref(false)
const showManageModal = ref(false)
const manageMode = ref<'owner' | 'member'>('member')
const focusedGroup = ref<GroupItem | null>(null)

// ── Action loading ──
// 各类行内操作的处理中集合：以 id 为 key 标记进行中，按钮禁用防重复点击
// （removing 用 "groupId:userId" 复合 key 区分不同小组的同一成员）
const actionIds = reactive({
  invitation: new Set<number>(),
  joinRequest: new Set<number>(),
  leaving: new Set<number>(),
  removing: new Set<string>(),
})
const isCreating = ref(false)
const isJoining = ref(false)
const isInviting = ref(false)
const isMembersLoading = ref(false)
const isRequestsLoading = ref(false)
const isMyRequestsLoading = ref(false)

// 顶部展示的当前用户昵称 / 用户 ID
const currentUserLabel = computed(() => authStore.currentUser?.displayName ?? '用户')
const currentUserIdLabel = computed(() => authStore.currentUser?.userId?.toString() ?? '--')
// "我的申请"Tab 总数 = 我提交的申请 + 我发出的邀请
const totalRequestCount = computed(() => myJoinRequests.value.length + mySentInvitations.value.length)

// 默认 Tab：有待处理邀请优先看邀请，其次看自己的组，否则看加入的组
function computeDefaultTab() {
  if (pendingInvitations.value.length > 0) return 'invitations'
  if (ownedGroups.value.length > 0) return 'owned'
  return 'joined'
}

// ── Lifecycle ──
// 当前登录用户变化（含 immediate 首次执行）时重新加载页面数据
watch(
  () => authStore.currentUser?.userId,
  () => { void loadInitialData() },
  { immediate: true },
)

// 首屏加载：并行拉取群组(含邀请)/我的申请/我发出的邀请，并决定默认 Tab
async function loadInitialData() {
  isInitialLoading.value = true
  error.value = ''
  try {
    const [result, requests, sent] = await Promise.all([fetchGroups(), fetchMyJoinRequests(), fetchMySentInvitations()])
    appStore.applyGroupQueryResult(result)
    myJoinRequests.value = requests
    mySentInvitations.value = sent
    activeTab.value = computeDefaultTab()
  } catch (err) {
    error.value = extractApiError(err, '加载协作小组数据失败')
  } finally {
    isInitialLoading.value = false
  }
}

// 写操作成功后的统一刷新：重新并行拉取三份数据写入 store 与本地 ref
async function refreshWorkspace() {
  try {
    const [result, requests, sent] = await Promise.all([fetchGroups(), fetchMyJoinRequests(), fetchMySentInvitations()])
    appStore.applyGroupQueryResult(result)
    myJoinRequests.value = requests
    mySentInvitations.value = sent
  } catch (err) {
    error.value = extractApiError(err, '刷新数据失败')
  }
}

// ── Tab switching ──
// 切换 Tab 并清空上一次的反馈/错误信息
function handleSelectTab(tab: string) {
  activeTab.value = tab as 'invitations' | 'owned' | 'joined' | 'requests'
  feedback.value = ''
  error.value = ''
}

// ── Invitations ──
// 接受邀请：成功后刷新数据并自动跳到"我加入的组" Tab
async function handleAcceptInvitation(invitationId: number) {
  const invitation = pendingInvitations.value.find((i) => i.invitationId === invitationId)
  actionIds.invitation.add(invitationId)
  error.value = ''
  feedback.value = ''
  try {
    await acceptInvitation(invitationId)
    feedback.value = '已接受邀请，该小组已加入「我加入的组」。'
    await refreshWorkspace()
    if (invitation && joinedGroups.value.length > 0) {
      activeTab.value = 'joined'
    }
  } catch (err) {
    error.value = extractApiError(err, '接受邀请失败')
  } finally {
    actionIds.invitation.delete(invitationId)
  }
}

// 拒绝邀请：成功后刷新数据
async function handleRejectInvitation(invitationId: number) {
  actionIds.invitation.add(invitationId)
  error.value = ''
  feedback.value = ''
  try {
    await rejectInvitation(invitationId)
    feedback.value = '已拒绝邀请。'
    await refreshWorkspace()
  } catch (err) {
    error.value = extractApiError(err, '拒绝邀请失败')
  } finally {
    actionIds.invitation.delete(invitationId)
  }
}

// ── Create group ──
// 创建小组：成功后关闭弹窗、切到"我拥有的组" Tab，并把它设为当前群组（供助手 KB 模式使用）
async function handleCreateGroup(payload: { name: string; description?: string }) {
  isCreating.value = true
  error.value = ''
  feedback.value = ''
  try {
    const groupId = await createGroup(payload)
    showCreateModal.value = false
    await refreshWorkspace()
    activeTab.value = 'owned'
    feedback.value = `已创建小组「${payload.name}」。`
    appStore.setCurrentGroupId(groupId)
  } catch (err) {
    error.value = extractApiError(err, '创建小组失败')
  } finally {
    isCreating.value = false
  }
}

// ── Join group ──
// 按组织 ID 提交加入申请：成功后关闭弹窗并重拉"我的申请"列表（等待对方审批）
async function handleSubmitJoinRequest(groupCode: string) {
  isJoining.value = true
  error.value = ''
  feedback.value = ''
  try {
    await submitJoinRequest(groupCode)
    showJoinModal.value = false
    myJoinRequests.value = await fetchMyJoinRequests()
    feedback.value = `已提交加入申请（组织 ID: ${groupCode}），等待管理员审批。`
  } catch (err) {
    error.value = extractApiError(err, '提交加入申请失败')
  } finally {
    isJoining.value = false
  }
}

// ── Manage group ──
// 打开管理弹窗：按 mode 从拥有/加入列表定位小组；owner 模式才需要并行
// 拉取成员列表与该组的加入申请，member 模式仅展示信息
async function openManageModal(groupId: number, mode: 'owner' | 'member') {
  const group = mode === 'owner'
    ? ownedGroups.value.find((g) => g.groupId === groupId)
    : joinedGroups.value.find((g) => g.groupId === groupId)
  if (!group) return

  focusedGroup.value = group
  manageMode.value = mode
  showManageModal.value = true
  groupMembers.value = []
  ownerJoinRequests.value = []

  if (mode === 'owner') {
    await Promise.all([loadMembers(groupId), loadJoinRequests(groupId)])
  }
}

// 拉取指定小组的成员列表（弹窗内展示）
async function loadMembers(groupId: number) {
  isMembersLoading.value = true
  try {
    groupMembers.value = await fetchGroupMembers(groupId)
  } catch (err) {
    groupMembers.value = []
    error.value = extractApiError(err, '加载成员失败')
  } finally {
    isMembersLoading.value = false
  }
}

// 拉取指定小组待审批的加入申请列表
async function loadJoinRequests(groupId: number) {
  isRequestsLoading.value = true
  try {
    ownerJoinRequests.value = await fetchOwnerJoinRequests(groupId)
  } catch (err) {
    ownerJoinRequests.value = []
    error.value = extractApiError(err, '加载加入申请失败')
  } finally {
    isRequestsLoading.value = false
  }
}

// ── Invite member ──
// 向指定用户 ID 发出加入邀请（管理弹窗内的 owner 操作）
async function handleInviteMember(userId: number) {
  if (!focusedGroup.value) return
  isInviting.value = true
  error.value = ''
  feedback.value = ''
  try {
    await createInvitation(focusedGroup.value.groupId, userId)
    feedback.value = `已向用户 #${userId} 发出邀请。`
  } catch (err) {
    error.value = extractApiError(err, '发起邀请失败')
  } finally {
    isInviting.value = false
  }
}

// ── Remove member ──
// 移除成员：成功后刷新弹窗内成员列表并整体刷新工作区
async function handleRemoveMember(userId: number) {
  if (!focusedGroup.value) return
  const key = `${focusedGroup.value.groupId}:${userId}`
  actionIds.removing.add(key)
  error.value = ''
  feedback.value = ''
  try {
    await removeGroupMember(focusedGroup.value.groupId, userId)
    await loadMembers(focusedGroup.value.groupId)
    feedback.value = `已移除成员 #${userId}。`
    await refreshWorkspace()
  } catch (err) {
    error.value = extractApiError(err, '移除成员失败')
  } finally {
    actionIds.removing.delete(key)
  }
}

// ── Join requests ──
// 通过加入申请：刷新弹窗内的申请与成员列表，并整体刷新（成员数变化）
async function handleApproveRequest(requestId: number) {
  if (!focusedGroup.value) return
  actionIds.joinRequest.add(requestId)
  error.value = ''
  feedback.value = ''
  try {
    await approveJoinRequest(focusedGroup.value.groupId, requestId)
    await loadJoinRequests(focusedGroup.value.groupId)
    await loadMembers(focusedGroup.value.groupId)
    feedback.value = '已通过加入申请。'
    await refreshWorkspace()
  } catch (err) {
    error.value = extractApiError(err, '通过申请失败')
  } finally {
    actionIds.joinRequest.delete(requestId)
  }
}

// 拒绝加入申请：仅刷新弹窗内的申请列表
async function handleRejectRequest(requestId: number) {
  if (!focusedGroup.value) return
  actionIds.joinRequest.add(requestId)
  error.value = ''
  feedback.value = ''
  try {
    await rejectJoinRequest(focusedGroup.value.groupId, requestId)
    await loadJoinRequests(focusedGroup.value.groupId)
    feedback.value = '已拒绝加入申请。'
  } catch (err) {
    error.value = extractApiError(err, '拒绝申请失败')
  } finally {
    actionIds.joinRequest.delete(requestId)
  }
}

// ── Leave group ──
// 退出小组：ElMessageBox 确认（取消则直接返回）后调接口，关闭弹窗并刷新数据
async function handleLeaveGroup(groupId: number) {
  const group = joinedGroups.value.find((g) => g.groupId === groupId)
  if (!group) return

  try {
    await ElMessageBox.confirm(
      `确定要退出「${group.groupName}」吗？退出后你将无法访问该小组的文档和问答。`,
      '确认退出',
      { confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // user cancelled
  }

  actionIds.leaving.add(groupId)
  error.value = ''
  feedback.value = ''
  try {
    await leaveGroup(groupId)
    showManageModal.value = false
    feedback.value = `已退出小组「${group.groupName}」。`
    await refreshWorkspace()
  } catch (err) {
    error.value = extractApiError(err, '退出小组失败')
  } finally {
    actionIds.leaving.delete(groupId)
  }
}
</script>

<template>
  <div class="groups-page">
    <!-- Hero -->
    <PageHeaderHero
      eyebrow="协作小组"
      title="我的组"
      :description="isInitialLoading ? '正在加载协作空间数据...' : '管理你的知识库协作空间，创建或加入小组进行文档协同'"
    >
      <template #actions>
        <div class="groups-page__identity">
          <span>{{ currentUserLabel }}</span>
          <small>ID: {{ currentUserIdLabel }}</small>
        </div>
      </template>
    </PageHeaderHero>

    <!-- Feedback -->
    <div v-if="feedback || error" class="groups-feedback">
      <p v-if="feedback" class="feedback feedback--success">{{ feedback }}</p>
      <p v-if="error" class="feedback feedback--error">{{ error }}</p>
    </div>

    <!-- Loading -->
    <div v-if="isInitialLoading" class="groups-loading">
      <div class="spinner"></div>
      <p>正在加载协作空间...</p>
    </div>

    <!-- 非首屏加载态：统计栏 + Tab 头 + 面板 -->
    <template v-else>
      <!-- Stats bar -->
      <GroupStatsBar
        :owned-count="ownedGroups.length"
        :joined-count="joinedGroups.length"
        :invitation-count="pendingInvitations.length"
        :request-count="totalRequestCount"
        :active-tab="activeTab"
        @select-tab="handleSelectTab"
      />

      <!-- Layout Header (Tabs + Toolbar) -->
      <div class="groups-layout-header">
        <!-- Tabs -->
        <div class="groups-tabs">
          <button
            class="tab-btn"
            :class="{ 'is-active': activeTab === 'owned' }"
            type="button"
            @click="handleSelectTab('owned')"
          >
            我拥有的组
            <span class="tab-btn__count">{{ ownedGroups.length }}</span>
          </button>
          <button
            class="tab-btn"
            :class="{ 'is-active': activeTab === 'joined' }"
            type="button"
            @click="handleSelectTab('joined')"
          >
            我加入的组
            <span class="tab-btn__count">{{ joinedGroups.length }}</span>
          </button>
          <button
            class="tab-btn"
            :class="{ 'is-active': activeTab === 'invitations' }"
            type="button"
            @click="handleSelectTab('invitations')"
          >
            待处理邀请
            <span v-if="pendingInvitations.length > 0" class="tab-btn__count tab-btn__count--warn">
              {{ pendingInvitations.length }}
            </span>
          </button>
          <button
            class="tab-btn"
            :class="{ 'is-active': activeTab === 'requests' }"
            type="button"
            @click="handleSelectTab('requests')"
          >
            我的申请
            <span class="tab-btn__count">{{ totalRequestCount }}</span>
          </button>
        </div>

        <!-- Toolbar Actions -->
        <div class="groups-toolbar">
          <button class="modern-action-btn modern-action-btn--primary" @click="showCreateModal = true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            创建小组
          </button>
          <button class="modern-action-btn" @click="showJoinModal = true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            加入小组
          </button>
        </div>
      </div>

      <!-- Tab content：四个 Tab 面板按 activeTab 条件渲染，均为受控组件（数据下传、事件上抛） -->
      <div class="groups-tab-content">
        <InvitationsTab
          v-if="activeTab === 'invitations'"
          :items="pendingInvitations"
          :action-ids="actionIds.invitation"
          @accept="handleAcceptInvitation"
          @reject="handleRejectInvitation"
        />
        <OwnedGroupsTab
          v-if="activeTab === 'owned'"
          :items="ownedGroups"
          @manage="(id: number) => openManageModal(id, 'owner')"
        />
        <JoinedGroupsTab
          v-if="activeTab === 'joined'"
          :items="joinedGroups"
          :leaving-ids="actionIds.leaving"
          @view="(id: number) => openManageModal(id, 'member')"
          @leave="handleLeaveGroup"
        />
        <MyRequestsTab
          v-if="activeTab === 'requests'"
          :items="myJoinRequests"
          :sent-invitations="mySentInvitations"
        />
      </div>
    </template>

    <!-- Modals -->
    <CreateGroupModal
      v-model:visible="showCreateModal"
      :loading="isCreating"
      @submit="handleCreateGroup"
    />
    <JoinGroupModal
      v-model:visible="showJoinModal"
      :loading="isJoining"
      @submit="handleSubmitJoinRequest"
    />
    <GroupManageModal
      v-model:visible="showManageModal"
      :mode="manageMode"
      :group="focusedGroup"
      :members="groupMembers"
      :requests="ownerJoinRequests"
      :is-members-loading="isMembersLoading"
      :is-requests-loading="isRequestsLoading"
      :is-inviting="isInviting"
      :removing-keys="actionIds.removing"
      :request-action-ids="actionIds.joinRequest"
      @remove-member="handleRemoveMember"
      @approve-request="handleApproveRequest"
      @reject-request="handleRejectRequest"
      @invite-member="handleInviteMember"
      @leave-group="() => { if (focusedGroup) handleLeaveGroup(focusedGroup.groupId) }"
    />
  </div>
</template>

<style scoped>
/* Push the hero further apart from stats for clear visual hierarchy */
.groups-page :deep(.page-header-hero) {
  margin-bottom: 36px;
}

/* Feedback */
.groups-feedback {
  margin-bottom: 8px;
}

.feedback {
  margin: 0 0 8px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.86rem;
  line-height: 1.5;
}

.feedback--success {
  background: rgba(16, 185, 129, 0.08);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.feedback--error {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.15);
}

/* Loading */
.groups-loading {
  text-align: center;
  padding: 80px 24px;
}

.groups-loading p {
  margin-top: 16px;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  margin: 0 auto;
  border: 3px solid var(--surface-muted);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Identity */
.groups-page__identity {
  text-align: right;
  line-height: 1.4;
}

.groups-page__identity span {
  display: block;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
}

.groups-page__identity small {
  font-size: 0.74rem;
  color: var(--text-muted);
}

/* Layout Header */
.groups-layout-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 2px solid var(--border-default);
  margin-bottom: 28px;
}

/* Toolbar */
.groups-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

/* Modern Action Buttons */
.modern-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid var(--border-default);
  background: var(--surface-white);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.modern-action-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
  background: var(--surface-subtle);
}

.modern-action-btn--primary {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

.modern-action-btn--primary:hover {
  background: var(--brand-primary-dark);
  border-color: var(--brand-primary-dark);
  color: #fff;
}

/* Tabs */
.groups-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: -2px;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.is-active {
  color: var(--brand-primary);
  border-bottom-color: var(--brand-primary);
}

.tab-btn__count {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--surface-muted);
  color: var(--text-secondary);
}

.tab-btn__count--warn {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.groups-tab-content {
  min-height: 200px;
}
</style>
