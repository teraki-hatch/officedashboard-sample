import { useEffect, useState } from 'react';

/** 現在時刻を1秒ごとに更新するフック */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatDateJa(d: Date): string {
  const week = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${week[d.getDay()]})`;
}

export function formatTimeHMS(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function greetingByHour(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'お疲れさまです';
  if (h < 11) return 'おはようございます';
  if (h < 18) return 'こんにちは';
  return 'お疲れさまです';
}
