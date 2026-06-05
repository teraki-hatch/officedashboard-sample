// Phase D-4-b: TaskBoard 型定義
// boards / lists / cards / labels / card_labels / checklist_items / comments

export type Board = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type TaskList = {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
};

/** カードの状態 */
export type TaskStatus = '未着手' | '進行中' | '確認中' | '完了';

export const TASK_STATUSES: TaskStatus[] = [
  '未着手',
  '進行中',
  '確認中',
  '完了',
];

export type TaskCard = {
  id: string;
  list_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  start_date: string | null;
  status: TaskStatus | null;
  attachment_url: string | null;
  position: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  /** JOIN: 担当者 */
  assignee?: TaskUser | null;
  /** JOIN: 紐づくラベル */
  labels?: TaskLabel[];
  /** JOIN: チェックリスト件数 (completed/total) */
  checklist_count?: { total: number; completed: number };
  /** JOIN: コメント数 */
  comment_count?: number;
};

export type TaskLabel = {
  id: string;
  name: string;
  /** Tailwind color name (yellow/sky/teal/green/blue/orange/pink/red/gray) */
  color: string;
  created_at: string;
  updated_at: string;
};

export type TaskUser = {
  id: string;
  name: string;
  employee_code?: string | null;
};

export type ChecklistItem = {
  id: string;
  card_id: string;
  title: string;
  is_completed: boolean;
  due_date: string | null;
  start_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskComment = {
  id: string;
  card_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  /** JOIN: 投稿者 */
  user?: TaskUser | null;
};

/** ラベル色のCSS値マッピング (tailwind系の色名 → 実際のhex) */
export const LABEL_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  yellow: { bg: '#fef3c7', text: '#92400e' },
  sky: { bg: '#e0f2fe', text: '#075985' },
  teal: { bg: '#ccfbf1', text: '#115e59' },
  green: { bg: '#dcfce7', text: '#166534' },
  blue: { bg: '#dbeafe', text: '#1e40af' },
  orange: { bg: '#ffedd5', text: '#9a3412' },
  pink: { bg: '#fce7f3', text: '#9d174d' },
  red: { bg: '#fee2e2', text: '#991b1b' },
  gray: { bg: '#f3f4f6', text: '#374151' },
};

export function labelColorStyle(color: string): { background: string; color: string } {
  const c = LABEL_COLOR_MAP[color] || LABEL_COLOR_MAP.gray;
  return { background: c.bg, color: c.text };
}

/** 状態のCSS値マッピング */
export const STATUS_COLOR_MAP: Record<TaskStatus, { bg: string; text: string }> = {
  '未着手': { bg: '#f3f4f6', text: '#374151' },
  '進行中': { bg: '#dbeafe', text: '#1e40af' },
  '確認中': { bg: '#fef3c7', text: '#92400e' },
  '完了': { bg: '#dcfce7', text: '#166534' },
};

export function statusColorStyle(status: TaskStatus | null): { background: string; color: string } {
  if (!status) return { background: '#f3f4f6', color: '#374151' };
  const s = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP['未着手'];
  return { background: s.bg, color: s.text };
}

/** フィルター */
export type TaskFilter = {
  searchQuery: string;
  assigneeId: string | 'all';
  dueFilter: 'all' | 'overdue' | 'today' | 'this_week' | 'no_due';
  showCompleted: boolean;
};
