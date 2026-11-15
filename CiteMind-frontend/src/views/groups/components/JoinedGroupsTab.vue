<script setup lang="ts">
// ============================================================
// "我加入的组"Tab：展示当前用户作为成员加入的小组
// ------------------------------------------------------------
// 职责：以 GroupCard 卡片列表展示已加入小组（组名、描述、组织 ID、
//   创建时间、"成员"绿色标签）；点击卡片查看详情（打开 member 模式的
//   GroupManageModal），底部"退出小组"按钮在退出中（leavingIds 命中）
//   时禁用并显示进行态。
//   实际的 leaveGroup / 弹窗逻辑在 GroupsPage 中完成。
// 依赖：无 api 调用，仅使用类型 GroupItem；子组件 GroupCard / EmptyState。
// 父子关系：父 → GroupsPage.vue；子 → GroupCard.vue、EmptyState.vue。
// ============================================================
import type { GroupItem } from '@/api/group'
import GroupCard from './GroupCard.vue'
import EmptyState from '@/components/EmptyState.vue'

// items：已加入小组列表；leavingIds：正在退出中的小组 ID 集合（按钮禁用）
defineProps<{
  items: GroupItem[]
  leavingIds: Set<number>
}>()

// view：点卡片查看详情；leave：请求退出（均上抛小组 ID）
const emit = defineEmits<{
  view: [groupId: number]
  leave: [groupId: number]
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
    <!-- 空态：还没加入任何小组 -->
    <EmptyState
      v-if="items.length === 0"
      title="你还没有加入任何小组"
      description="接受其他用户的邀请，或点击上方「加入小组」输入组织 ID 提交加入申请。"
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
        tagText="成员"
        tagType="success"
        @click="emit('view', group.groupId)"
      >
        <!-- 操作区：退出小组（退出中显示进行态并禁用） -->
        <template #actions>
          <button
            class="minimal-action-btn minimal-action-btn--danger"
            type="button"
            :disabled="leavingIds.has(group.groupId)"
            @click.stop="emit('leave', group.groupId)"
          >
            {{ leavingIds.has(group.groupId) ? '退出中...' : '退出小组' }}
          </button>
        </template>
      </GroupCard>
    </div>
  </div>
</template>

<style scoped>
.tab-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}


.minimal-action-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.minimal-action-btn:hover {
  color: var(--brand-primary);
}

.minimal-action-btn--danger:hover {
  color: var(--el-color-danger);
}

.minimal-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

</style>
