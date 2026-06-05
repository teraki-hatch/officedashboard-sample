/**
 * 出勤ステータスの型
 * --------------------------------------------------------------
 * 将来的に Supabase の勤怠テーブルを 「読み取り専用」 で参照して
 * ここに流し込む想定。現時点では UI のみ。
 * --------------------------------------------------------------
 */
export type AttendanceStatus = 'working' | 'away' | 'left' | 'absent';

export const ATTENDANCE_STATUS_META: Record<
  AttendanceStatus,
  { label: string; badgeClass: string; dotColor: string }
> = {
  working: { label: '出勤中', badgeClass: 'badge--ok', dotColor: '#2f7d4f' },
  away: { label: '離席中', badgeClass: 'badge--warn', dotColor: '#c98a14' },
  left: { label: '退勤済み', badgeClass: 'badge--info', dotColor: '#2a5c8a' },
  absent: { label: '未出勤', badgeClass: 'badge--mute', dotColor: '#9a9aa3' },
};

export type Member = {
  id: string;
  name: string;
  department?: string;
  status: AttendanceStatus;
  /** 最終更新時刻 (例: '09:12') */
  updatedAt?: string;
};

/** ダミーデータ (Supabase 接続前の初期表示用) */
export const DUMMY_MEMBERS: Member[] = [
  { id: 'u1', name: '山田 太郎', department: '営業', status: 'working', updatedAt: '09:02' },
  { id: 'u2', name: '佐藤 花子', department: '開発', status: 'working', updatedAt: '08:58' },
  { id: 'u3', name: '鈴木 一郎', department: '開発', status: 'away', updatedAt: '12:05' },
  { id: 'u4', name: '高橋 結衣', department: '管理', status: 'working', updatedAt: '09:21' },
  { id: 'u5', name: '田中 翔', department: '営業', status: 'left', updatedAt: '18:30' },
  { id: 'u6', name: '伊藤 美咲', department: '開発', status: 'absent' },
  { id: 'u7', name: '渡辺 健', department: '管理', status: 'working', updatedAt: '08:45' },
  { id: 'u8', name: '中村 さくら', department: '営業', status: 'away', updatedAt: '11:50' },
];
