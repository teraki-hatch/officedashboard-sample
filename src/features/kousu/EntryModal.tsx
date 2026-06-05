// Phase D-1: 案件単位で工数つけるように変更
import { useEffect, useMemo, useState } from 'react';
import { entriesOnDate, parseDateStr, r2, sumHours, WEEKDAYS } from './kousuUtils';
import { useKousuEntry } from './useKousuEntry';
import { useDailyAttendance } from './useDailyAttendance';
import { GoogleCalendarPanel } from './GoogleCalendarPanel';
import { DealCombobox } from './DealCombobox';
import type { FillFromGcalArgs } from './GoogleCalendarPanel';
import type { Client, Deal, TimeEntry, WorkCategory } from './types';
import './EntryModal.css';
import './ProjectCombobox.css';

/**
 * 日次工数 CRUD モーダル (Phase 4-1 + Gcal連携 + タイトル欄)
 * --------------------------------------------------------------
 * Phase C-5: 絵文字を非表示 & 色ドットを client.color に連動
 *
 * 左カラム: 工数フォーム + その日の既存エントリ一覧
 * 右カラム: Googleカレンダーの予定リスト (「入力欄へ」で左に転記)
 * --------------------------------------------------------------
 */

export type EntryModalProps = {
  ds: string;
  userId: string;
  /** @deprecated 案件ベースに移行したため未使用、互換性のため受け取りだけ残す */
  clients?: Client[];
  deals: Deal[];
  categories: WorkCategory[];
  monthEntries: TimeEntry[];
  onClose: () => void;
  onSaved: () => void;
};

const HOUR_PRESETS = ['0.5', '1', '1.5', '2', '3', '4', '7'];

export function EntryModal({
  ds,
  userId,
  deals,
  categories,
  monthEntries,
  onClose,
  onSaved,
}: EntryModalProps) {
  const dayEntries = useMemo(
    () => entriesOnDate(monthEntries, ds),
    [monthEntries, ds]
  );
  const dayTotal = useMemo(() => sumHours(dayEntries), [dayEntries]);

  const attendance = useDailyAttendance(userId, ds);
  const diffHours = useMemo<number | null>(() => {
    if (attendance.actualHours == null) return null;
    return r2(attendance.actualHours - dayTotal);
  }, [attendance.actualHours, dayTotal]);

  const { saving, deleting, lastError, save, remove, clearError } =
    useKousuEntry();

  // フォーム
  const [editId, setEditId] = useState<string | null>(null);
  const [dealId, setDealId] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [hoursVal, setHoursVal] = useState<string>('');
  const [titleVal, setTitleVal] = useState<string>('');
  const [memoVal, setMemoVal] = useState<string>('');
  /** Gcal 連携: フォームに転記された予定の event_id (保存時に DB に保存) */
  const [gcalEventId, setGcalEventId] = useState<string | null>(null);

  const d = parseDateStr(ds);
  const titleDate = `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deleting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving, deleting]);

  const resetForm = () => {
    setEditId(null);
    setDealId('');
    setClientId('');
    setCategoryId('');
    setHoursVal('');
    setTitleVal('');
    setMemoVal('');
    setGcalEventId(null);
    clearError();
  };

  const startEdit = (entry: TimeEntry) => {
    setEditId(entry.id);
    setDealId(entry.deal_id || '');
    setClientId(entry.client_id);
    setCategoryId(entry.work_category_id);
    setHoursVal(String(entry.hours));
    setTitleVal(entry.title ?? '');
    setMemoVal(entry.memo ?? '');
    setGcalEventId(null); // 編集時は新規 Gcal 連携は付けない
    clearError();
  };

  /** Googleカレンダーの予定をフォームに転記 (タイトル欄に予定タイトル、所要時間を工数欄に) */
  const handleFillFromGcal = (args: FillFromGcalArgs) => {
    setEditId(null);
    setTitleVal(args.title);
    if (args.hours > 0) {
      setHoursVal(String(args.hours));
    }
    setGcalEventId(args.eventId);
    clearError();
  };

  const onClickBackdrop = () => {
    if (saving || deleting) return;
    onClose();
  };

  const handleSave = async () => {
    if (!dealId) return;
    if (!clientId) return;
    if (!categoryId) return;
    const h = parseFloat(hoursVal);
    if (!hoursVal || Number.isNaN(h) || h <= 0 || h > 24) return;

    const r = await save({
      userId,
      date: ds,
      clientId,
      dealId,
      workCategoryId: categoryId,
      hours: h,
      title: titleVal,
      memo: memoVal,
      editId,
      googleCalendarEventId: editId ? null : gcalEventId,
    });
    if (r.ok) {
      resetForm();
      onSaved();
    }
  };

  const handleDelete = async (entry: TimeEntry) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('この工数を削除しますか？')) return;
    const r = await remove({ userId, entryId: entry.id });
    if (r.ok) {
      if (editId === entry.id) resetForm();
      onSaved();
    }
  };

  // バリデーション
  const hNum = parseFloat(hoursVal);
  const hoursValid =
    hoursVal !== '' && Number.isFinite(hNum) && hNum > 0 && hNum <= 24;
  const canSave =
    !!dealId && !!clientId && !!categoryId && hoursValid && !saving && !deleting;

  return (
    <div
      className="kousu-modal__backdrop"
      onClick={onClickBackdrop}
      role="presentation"
    >
      <div
        className="kousu-modal__panel kousu-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kousu-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="kousu-modal__header">
          <h3 id="kousu-modal-title" className="kousu-modal__title">
            {titleDate} の工数
          </h3>
          <span className="kousu-modal__total">
            合計: <strong>{dayTotal}</strong> h
          </span>
          <button
            type="button"
            className="kousu-modal__close"
            onClick={onClose}
            disabled={saving || deleting}
            aria-label="閉じる"
          >
            ✕
          </button>
        </header>

        {lastError && (
          <div className="kousu-modal__error">
            <p>{lastError}</p>
          </div>
        )}

        <div className="kousu-modal__split">
          {/* ===== 左カラム: 既存の工数フォーム ===== */}
          <div className="kousu-modal__left">
            {/* 勤怠 vs 工数 */}
            <section className="kousu-diff">
              {attendance.loading ? (
                <div className="kousu-diff__loading">勤怠を確認中…</div>
              ) : attendance.reason === 'no-record' ? (
                <div className="kousu-diff__row kousu-diff__row--mute">
                  <span className="kousu-diff__label">勤怠との照合</span>
                  <span className="kousu-diff__hint">この日の打刻記録はありません</span>
                </div>
              ) : attendance.reason === 'not-finished' ? (
                <div className="kousu-diff__row kousu-diff__row--warn">
                  <span className="kousu-diff__label">勤怠との照合</span>
                  <span className="kousu-diff__hint">退勤打刻がまだのため計算できません</span>
                </div>
              ) : attendance.reason === 'on-break' ? (
                <div className="kousu-diff__row kousu-diff__row--warn">
                  <span className="kousu-diff__label">勤怠との照合</span>
                  <span className="kousu-diff__hint">休憩終了の打刻がまだです</span>
                </div>
              ) : attendance.reason === 'leave' ? (
                <div className="kousu-diff__row kousu-diff__row--mute">
                  <span className="kousu-diff__label">勤怠との照合</span>
                  <span className="kousu-diff__hint">休暇日 (対象外)</span>
                </div>
              ) : attendance.actualHours != null ? (
                <div
                  className={`kousu-diff__row ${
                    diffHours != null && Math.abs(diffHours) < 0.01
                      ? 'kousu-diff__row--ok'
                      : diffHours != null && diffHours > 0
                      ? 'kousu-diff__row--short'
                      : 'kousu-diff__row--over'
                  }`}
                >
                  <div className="kousu-diff__main">
                    <span className="kousu-diff__label">勤怠</span>
                    <span className="kousu-diff__num">{attendance.actualHours.toFixed(2)}</span>
                    <span className="kousu-diff__unit">h</span>
                    <span className="kousu-diff__sep">／</span>
                    <span className="kousu-diff__label">工数</span>
                    <span className="kousu-diff__num">{dayTotal.toFixed(2)}</span>
                    <span className="kousu-diff__unit">h</span>
                  </div>
                  <div className="kousu-diff__delta">
                    <span className="kousu-diff__delta-label">差分</span>
                    <span className="kousu-diff__delta-value">
                      {diffHours != null && diffHours > 0 ? '−' : diffHours != null && diffHours < 0 ? '+' : '±'}
                      {diffHours != null ? Math.abs(diffHours).toFixed(2) : '0.00'}
                      <span className="kousu-diff__unit">h</span>
                    </span>
                    {diffHours != null && Math.abs(diffHours) < 0.01 && (
                      <span className="kousu-diff__badge kousu-diff__badge--ok">一致</span>
                    )}
                    {diffHours != null && diffHours >= 0.01 && (
                      <span className="kousu-diff__badge kousu-diff__badge--short">
                        {diffHours >= 1
                          ? `${Math.floor(diffHours)}時間以上 未入力`
                          : '工数 不足'}
                      </span>
                    )}
                    {diffHours != null && diffHours <= -0.01 && (
                      <span className="kousu-diff__badge kousu-diff__badge--over">
                        工数 超過
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </section>

            {/* 既存エントリ一覧 */}
            <section className="kousu-modal__entries">
              {dayEntries.length === 0 ? (
                <p className="kousu-modal__empty">この日の工数はまだ登録されていません。</p>
              ) : (
                <ul className="kousu-modal__entry-list">
                  {dayEntries.map((e) => {
                    const isEditingThis = editId === e.id;
                    return (
                      <li
                        key={e.id}
                        className={`kousu-modal__entry ${
                          isEditingThis ? 'kousu-modal__entry--editing' : ''
                        }`}
                      >
                        <div className="kousu-modal__entry-main">
                          <span
                            className="kousu-modal__entry-color"
                            style={{ background: e.client?.color ?? '#9ca3af' }}
                            aria-hidden
                          />
                          <span className="kousu-modal__entry-project">
                            {e.client?.name ?? '—'}
                          </span>
                          <span className="kousu-modal__entry-category">
                            {e.category?.name ?? '—'}
                          </span>
                          <span className="kousu-modal__entry-hours">{e.hours}h</span>
                          {e.google_calendar_event_id && (
                            <span className="kousu-modal__entry-gcal" title="Googleカレンダーから登録">📅</span>
                          )}
                        </div>
                        {e.title && (
                          <div className="kousu-modal__entry-title">{e.title}</div>
                        )}
                        {e.memo && (
                          <div className="kousu-modal__entry-memo">{e.memo}</div>
                        )}
                        <div className="kousu-modal__entry-actions">
                          <button
                            type="button"
                            className="kousu-modal__btn kousu-modal__btn--mini"
                            onClick={() => startEdit(e)}
                            disabled={saving || deleting}
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className="kousu-modal__btn kousu-modal__btn--mini kousu-modal__btn--del"
                            onClick={() => handleDelete(e)}
                            disabled={saving || deleting}
                          >
                            削除
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 入力フォーム */}
            <section className="kousu-modal__form">
              <h4 className="kousu-modal__form-title">
                {editId ? 'エントリを編集' : '新規エントリを追加'}
                {gcalEventId && !editId && (
                  <span className="kousu-modal__gcal-tag">📅 Gcal連携中</span>
                )}
                {editId && (
                  <button
                    type="button"
                    className="kousu-modal__cancel-edit"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    新規入力に戻る
                  </button>
                )}
              </h4>

              <div className="kousu-modal__form-row">
                <label className="kousu-modal__label">
                  案件 <span className="kousu-modal__req">*</span>
                </label>
                <DealCombobox
                  deals={deals}
                  value={dealId}
                  onChange={(dId, cId) => {
                    setDealId(dId);
                    setClientId(cId);
                  }}
                  disabled={saving}
                />
              </div>

              <div className="kousu-modal__form-row">
                <label className="kousu-modal__label">
                  作業カテゴリ <span className="kousu-modal__req">*</span>
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={saving}
                  className="kousu-modal__input"
                >
                  <option value="">選択してください</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="kousu-modal__form-row">
                <label className="kousu-modal__label">
                  工数 (h) <span className="kousu-modal__req">*</span>
                </label>
                <div className="kousu-modal__hours-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="24"
                    value={hoursVal}
                    onChange={(e) => setHoursVal(e.target.value)}
                    disabled={saving}
                    className="kousu-modal__input kousu-modal__input--num"
                    placeholder="0.5 など"
                  />
                  <div className="kousu-modal__presets">
                    {HOUR_PRESETS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className="kousu-modal__preset"
                        onClick={() => setHoursVal(h)}
                        disabled={saving}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="kousu-modal__form-row">
                <label className="kousu-modal__label">
                  タイトル
                </label>
                <input
                  type="text"
                  value={titleVal}
                  onChange={(e) => setTitleVal(e.target.value)}
                  disabled={saving}
                  className="kousu-modal__input"
                  placeholder="作業内容 (例: MTG:寺木×平石_TODO確認)"
                />
              </div>

              <div className="kousu-modal__form-row">
                <label className="kousu-modal__label">詳細メモ</label>
                <textarea
                  value={memoVal}
                  onChange={(e) => setMemoVal(e.target.value)}
                  disabled={saving}
                  className="kousu-modal__textarea"
                  rows={2}
                  placeholder="詳細メモ (任意)"
                />
              </div>

              <div className="kousu-modal__actions">
                <button
                  type="button"
                  className="kousu-modal__btn kousu-modal__btn--save"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {saving ? '保存中…' : editId ? '更新する' : '追加する'}
                </button>
                <button
                  type="button"
                  className="kousu-modal__btn kousu-modal__btn--cancel"
                  onClick={onClose}
                  disabled={saving || deleting}
                >
                  閉じる
                </button>
              </div>
            </section>
          </div>

          {/* ===== 右カラム: Googleカレンダーパネル ===== */}
          <div className="kousu-modal__right">
            <GoogleCalendarPanel
              ds={ds}
              dayEntries={dayEntries}
              onFillForm={handleFillFromGcal}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
