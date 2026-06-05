/**
 * Promise タイムアウトユーティリティ
 * --------------------------------------------------------------
 * Supabase クエリは Promise ではなく thenable な builder なので、
 * Promise.resolve でラップしてから渡す。
 *
 * - 指定ミリ秒経過しても解決しなければ reject する
 * - 元の Promise が解決/拒否すれば、タイマーは確実にクリアされる
 *
 * 既存のフックで「読み込み中…」「送信中…」のまま固まる症状の
 * 安全網として使用する。
 * --------------------------------------------------------------
 */
export function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} がタイムアウトしました (${ms / 1000}秒)`));
    }, ms);
    Promise.resolve(promise)
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}
