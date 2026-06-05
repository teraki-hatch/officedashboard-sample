// Phase D-4-e (Step 4): コメント機能 - CRUDフック
//   - 一覧取得 (古い順、author_name 結合)
//   - 投稿 (現在ユーザーの public.users.id を user_id にセット)
//   - 編集 (本人のみ - RLS で保証)
//   - 削除 (本人のみ - RLS で保証)
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export type CardComment = {
  id: string;
  card_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
  // 結合した投稿者表示名 (なければ '不明')
  author_name: string;
};

export type CurrentUserInfo = {
  user_id: string; // public.users.id
  auth_user_id: string; // auth.uid()
  name: string;
};

/**
 * 現在ログイン中ユーザーの public.users レコード情報を取得
 */
export function useCurrentUserInfo(): {
  me: CurrentUserInfo | null;
  loading: boolean;
} {
  const [me, setMe] = useState<CurrentUserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();
        if (!sb) return;
        const { data: auth } = await sb.auth.getUser();
        const authUserId = auth?.user?.id;
        if (!authUserId) return;
        const { data, error } = await sb
          .from('users')
          .select('id, name')
          .eq('auth_user_id', authUserId)
          .maybeSingle();
        if (error) {
          console.error('[OfficeHub:tasks:comments] me fetch error', error);
          return;
        }
        if (cancelled) return;
        if (data) {
          setMe({
            user_id: data.id as string,
            auth_user_id: authUserId,
            name: (data.name as string) ?? '不明',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { me, loading };
}

export function useComments(cardId: string): {
  comments: CardComment[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addComment: (content: string, userId: string) => Promise<void>;
  updateComment: (id: string, content: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
} {
  const [comments, setComments] = useState<CardComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase 未設定');

      // comments と public.users を結合して author_name を取得
      // user_id (public.users.id) → users.name
      const { data, error: e } = await sb
        .from('comments')
        .select(
          `
          id,
          card_id,
          user_id,
          content,
          created_at,
          users:user_id ( name )
        `
        )
        .eq('card_id', cardId)
        .order('created_at', { ascending: true });

      if (e) throw e;

      const rows = (data ?? []).map((r) => {
        // users は外部キー結合の結果 (オブジェクト or null)
        const userObj = (r as { users?: { name?: string } | null }).users;
        const authorName = userObj?.name ?? '不明';
        return {
          id: r.id as string,
          card_id: r.card_id as string,
          user_id: (r.user_id as string | null) ?? null,
          content: (r.content as string) ?? '',
          created_at: (r.created_at as string) ?? '',
          author_name: authorName,
        };
      });
      setComments(rows);
    } catch (err) {
      console.error('[OfficeHub:tasks:comments] reload error', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addComment = useCallback(
    async (content: string, userId: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setError(null);
      try {
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase 未設定');
        const { error: e } = await sb.from('comments').insert({
          card_id: cardId,
          user_id: userId,
          content: trimmed,
        });
        if (e) throw e;
        await reload();
      } catch (err) {
        console.error('[OfficeHub:tasks:comments] add error', err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [cardId, reload]
  );

  const updateComment = useCallback(
    async (id: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setError(null);
      try {
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase 未設定');
        const { error: e } = await sb
          .from('comments')
          .update({ content: trimmed })
          .eq('id', id);
        if (e) throw e;
        await reload();
      } catch (err) {
        console.error('[OfficeHub:tasks:comments] update error', err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [reload]
  );

  const deleteComment = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase 未設定');
        const { error: e } = await sb.from('comments').delete().eq('id', id);
        if (e) throw e;
        await reload();
      } catch (err) {
        console.error('[OfficeHub:tasks:comments] delete error', err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [reload]
  );

  return { comments, loading, error, reload, addComment, updateComment, deleteComment };
}
