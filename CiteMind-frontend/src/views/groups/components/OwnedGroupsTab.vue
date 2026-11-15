<script setup lang="ts">
// ============================================================
// "我拥有的组"Tab：展示当前用户创建（所有者）的小组
// ------------------------------------------------------------
// 职责：以 GroupCard 卡片列表展示我拥有的小组（"所有者"蓝色标签、
//   组织 ID、创建时间）；有 pendingRequestCount > 0 的组在 meta 插槽
//   显示"待处理申请"红色提醒。点击卡片打开所有者模式的
//   GroupManageModal（邀请成员 / 审批申请 / 移除成员）。
// 依赖：无 api 调用，仅使用类型 GroupItem；子组件 GroupCard / EmptyState。
// 父子关系：父 → GroupsPage.vue；子 → GroupCard.vue、EmptyState.vue。
// ============================================================
import type { GroupItem } from '@/api/group'
import GroupCard from './GroupCard.vue'
import EmptyState from '@/components/EmptyState.vue'

// items：我拥有的小组列表（含 pendingRequestCount 待审批数）
defineProps<{
  items: GroupItem[]
}>()

// 点卡片请求打开管理弹窗，上抛小组 ID
const emit = defineEmits<{
  manage: [groupId: number]
}>()

// 日期格式化为 yyyy.mm.dd；无法解析时截取字符串日期部分兜底
function formatDate(dateStr?: string) {
  if (!dateStr) return '未知时间'
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }
  return String(dateStr).split(' ')[0]?.split('T')[0] ?? ''.replace(/-/g, '.')
}
</script>

<template>
  <div>
    <!-- 空态：还没创建过小组 -->
    <EmptyState
      v-if="items.length === 0"
      title="你还没有创建任何小组"
      description="点击上方「创建小组」创建你的第一个协作空间，创建后即可邀请成员、上传文档。"
    />

    <!-- 小组卡片网格 -->
    <div v-else class="tab-card-grid">
      <GroupCard
        v-for="group in items"
        :key="group.groupId"
        :title="group.groupName"
        :description="group.description"
        :code="group.groupCode"
        :time="`创建于 ${formatDate(group.createdAt)}`"
        tagText="所有者"
        tagType="accent"
        @click="emit('manage', group.groupId)"
      >
        <!-- meta 插槽：有待审批加入申请时显示红色提醒（引导去管理弹窗处理） -->
        <template #meta v-if="group.pendingRequestCount && group.pendingRequestCount > 0">
          <div class="group-card__alert">
            <span class="alert-dot"></span>
            <span>有 {{ group.pendingRequestCount }} 条加入申请待处理</span>
          </div>
        </template>
      </GroupCard>
    </div>
  </div>
</template>

<style scoped>
/* Reuses styles from InvitationsTab — see that file for full style definitions */
.tab-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}





.group-card__alert {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: rgba(239, 68, 68, 0.08);
  color: var(--el-color-danger);
  font-size: 0.82rem;
  font-weight: 600;
}

.alert-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-danger);
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

</style>
