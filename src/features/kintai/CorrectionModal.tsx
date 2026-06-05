import { useEffect, useMemo, useState } from 'react';
import type { AttendanceRecord, WorkType } from './types';
import { useCorrectionRequest, type BreakInput } from './useCorrectionRequest';
import type { AttendanceBreak } from './types';
import { checkMonthLocked } from '../closure/checkLocked';
import './CorrectionModal.css';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WORK_LABEL: Record<string, string> = {
  remote: '在宅',
  office: '出社',
  business_trip: '出張',
  normal: '出社',
};

export type CorrectionModalProps = {
  targetDate: string;
  record: AttendanceRecord | null;
  breaks: AttendanceBreak[];
  leaveType: string | null;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
};

function isoToHHMM(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 既存の attendance_breaks → BreakInput 配列 */
function breaksToInputs(arr: AttendanceBreak[]): BreakInput[] {
  return arr
    .map((b) => ({
      break_start: isoToHHMM(b.break_start),
      break_end: isoToHHMM(b.break_end),
      memo: b.memo ?? '',
    }))
    .filter((b) => b.break_start !== '');
}

export function CorrectionModal({
  targetDate,
  record,
  breaks,
  leaveType,
  userId,
  onClose,
  onSubmitted,
}: CorrectionModalProps) {
  const initialWorkType: WorkType =
    record?.work_type === 'office' ||
    record?.work_type === 'remote' ||
    record?.work_type === 'business_trip'
      ? (record.work_type as WorkType)
      : 'remote';

  const initialClockIn = useMemo(() => isoToHHMM(record?.clock_in), [record?.id]);
  const initialClockOut = useMemo(() => isoToHHMM(record?.clock_out), [record?.id]);
  const initialBreaks = useMemo(() => breaksToInputs(breaks), [breaks]);

  const [workType, setWorkType] = useState<WorkType>(initialWorkType);
  const [clockIn, setClockIn] = useState<string>(initialClockIn);
  const [clockOut, setClockOut] = useState<string>(initialClockOut);
  const [breakList, setBreakList] = useState<BreakInput[]>(initialBreaks);
  const [reason, setReason] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // ★ Phase 2: ロック警告
  const [lockMsg, setLockMsg] = useState<string | null>(null);

  const { saving, lastError, submit, clearError } = useCorrectionRequest();

  useEffect(() => {
    if (record?.work_type) {
      const wt = record.work_type;
      if (wt === 'office' || wt === 'remote' || wt === 'business_trip') {
        setWorkType(wt);
      }
    }
    if (record?.clock_in) setClockIn(isoToHHMM(record.clock_in));
    if (record?.clock_out) setClockOut(isoToHHMM(record.clock_out));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const d = new Date(targetDate + 'T00:00:00');
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;

  const onClickBackdrop = () => {
    if (saving) return;
    onClose();
  };

  const updateBreak = (idx: number, patch: Partial<BreakInput>) => {
    setBreakList((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
    );
  };

  const removeBreak = (idx: number) => {
    setBreakList((prev) => prev.filter((_, i) => i !== idx));
  };

  const addBreak = () => {
    setBreakList((prev) => [
      ...prev,
      { break_start: '', break_end: '', memo: '' },
    ]);
  };

  const handleSubmit = async () => {
    clearError();
    setLockMsg(null);

    // ★ Phase 2: 月次締めロック判定
    const lock = await checkMonthLocked(userId, targetDate);
    if (lock.locked) {
      setLockMsg(lock.message ?? '対象月は確定済のため修正申請できません');
      return;
    }

    const r = await submit({
      userId,
      targetDate,
      beforeWorkType: (record?.work_type as WorkType) ?? null,
      beforeClockIn: initialClockIn,
      beforeClockOut: initialClockOut,
      beforeBreaks: initialBreaks,
      afterWorkType: workType,
      afterClockIn: clockIn,
      afterClockOut: clockOut,
      afterBreaks: breakList,
      reason,
    });
    if (r.ok) {
      setSuccessMsg('勤怠修正申請を送信しました');
    }
  };

  const handleCloseAfterSuccess = () => {
    onSubmitted();
    onClose();
  };

  return (
    <div
      className="corr-modal__backdrop"
      onClick={onClickBackdrop}
      role="presentation"
    >
      <div
        className="corr-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="corr-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="corr-modal__header">
          <h3 id="corr-modal-title" className="corr-modal__title">
            勤怠修正申請
          </h3>
          <p className="corr-modal__date">{dateLabel}</p>
        </header>

        {successMsg ? (
          <div className="corr-modal__success">
            <div className="corr-modal__success-card">
              <p className="corr-modal__success-msg">✅ {successMsg}</p>
              <p className="corr-modal__success-sub">申請履歴から確認できます</p>
            </div>
            <button
              type="button"
              className="corr-modal__btn corr-modal__btn--secondary"
              onClick={handleCloseAfterSuccess}
            >
              閉じる
            </button>
          </div>
        ) : (
          <>
            {leaveType && (
              <div className="corr-modal__leave-note">
                <p>
                  この日は承認済み休暇があります。勤怠修正が必要な場合のみ申請してください。
                </p>
              </div>
            )}

            {/* ★ Phase 2: ロック警告 */}
            {lockMsg && (
              <div className="corr-modal__error">
                <p>🔒 {lockMsg}</p>
              </div>
            )}

            {lastError && (
              <div className="corr-modal__error">
                <p>{lastError}</p>
              </div>
            )}

            <div className="corr-modal__body">
              <div className="corr-modal__field">
                <label className="corr-modal__label">
                  修正後 勤務区分 <span className="corr-modal__required">*</span>
                </label>
                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value as WorkType)}
                  className="corr-modal__select"
                  disabled={saving}
                >
                  <option value="remote">在宅</option>
                  <option value="office">出社</option>
                  <option value="business_trip">出張</option>
                </select>
                {record?.work_type && record.work_type !== workType && (
                  <p className="corr-modal__hint corr-modal__hint--warn">
                    現在: {WORK_LABEL[record.work_type] ?? record.work_type} → 修正後:{' '}
                    {WORK_LABEL[workType]}
                  </p>
                )}
              </div>

              <div className="corr-modal__row">
                <div className="corr-modal__field">
                  <label className="corr-modal__label">修正後 出勤時刻</label>
                  <input
                    type="time"
                    value={clockIn}
                    onChange={(e) => setClockIn(e.target.value)}
                    className="corr-modal__input"
                    disabled={saving}
                  />
                </div>
                <div className="corr-modal__field">
                  <label className="corr-modal__label">修正後 退勤時刻</label>
                  <input
                    type="time"
                    value={clockOut}
                    onChange={(e) => setClockOut(e.target.value)}
                    className="corr-modal__input"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="corr-modal__field">
                <label className="corr-modal__label">休憩</label>
                <p className="corr-modal__hint">
                  時刻を入力してください。既存の休憩は初期表示されています。不要な休憩は「削除」、新しい休憩は「+ 休憩を追加」で追加できます。
                </p>
                {breakList.length === 0 && (
                  <p className="corr-modal__hint corr-modal__hint--mute">
                    休憩はありません
                  </p>
                )}
                {breakList.map((b, i) => (
                  <div key={i} className="corr-modal__break-row">
                    <input
                      type="time"
                      value={b.break_start}
                      onChange={(e) =>
                        updateBreak(i, { break_start: e.target.value })
                      }
                      className="corr-modal__input corr-modal__input--time"
                      disabled={saving}
                      aria-label={`休憩 ${i + 1} 開始`}
                    />
                    <span className="corr-modal__break-sep">〜</span>
                    <input
                      type="time"
                      value={b.break_end}
                      onChange={(e) =>
                        updateBreak(i, { break_end: e.target.value })
                      }
                      className="corr-modal__input corr-modal__input--time"
                      disabled={saving}
                      aria-label={`休憩 ${i + 1} 終了`}
                    />
                    <button
                      type="button"
                      className="corr-modal__break-del"
                      onClick={() => removeBreak(i)}
                      disabled={saving}
                      aria-label={`休憩 ${i + 1} を削除`}
                    >
                      削除
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="corr-modal__break-add"
                  onClick={addBreak}
                  disabled={saving}
                >
                  + 休憩を追加
                </button>
              </div>

              <div className="corr-modal__field">
                <label className="corr-modal__label">
                  申請理由 <span className="corr-modal__required">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="修正が必要な理由を記入してください"
                  className="corr-modal__textarea"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="corr-modal__actions">
              <button
                type="button"
                className="corr-modal__btn corr-modal__btn--primary"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? '送信中…' : '申請する'}
              </button>
              <button
                type="button"
                className="corr-modal__btn corr-modal__btn--secondary"
                onClick={onClose}
                disabled={saving}
              >
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
