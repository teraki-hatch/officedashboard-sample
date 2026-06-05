import { useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { withTimeout } from '../../lib/withTimeout';
import { logger } from '../../lib/logger';
import { buildReceiptPath } from './expenseUtils';

const BUCKET_NAME = 'receipts';

type UseReceiptUploadResult = {
  uploading: boolean;
  error: string | null;
  uploadReceipt: (userId: string, file: File) => Promise<string | null>;
  deleteReceipt: (filePath: string) => Promise<boolean>;
  getSignedUrl: (filePath: string) => Promise<string | null>;
};

export function useReceiptUpload(): UseReceiptUploadResult {
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 画像をアップロードして、保存パス(receipt_url列に入れる文字列)を返す
  async function uploadReceipt(
    userId: string,
    file: File
  ): Promise<string | null> {
    setUploading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      const path = buildReceiptPath(userId, file.name);

      const { error: uploadError } = await withTimeout(
        supabase.storage.from(BUCKET_NAME).upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        }),
        30000,
        'receipt upload'
      );

      if (uploadError) {
        throw uploadError;
      }

      return path;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('uploadReceipt error:', msg);
      setError(msg);
      return null;
    } finally {
      setUploading(false);
    }
  }

  // ファイルを削除
  async function deleteReceipt(filePath: string): Promise<boolean> {
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      const { error: deleteError } = await withTimeout(
        supabase.storage.from(BUCKET_NAME).remove([filePath]),
        10000,
        'receipt delete'
      );

      if (deleteError) {
        throw deleteError;
      }

      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('deleteReceipt error:', msg);
      setError(msg);
      return false;
    }
  }

  // 閲覧用の署名付きURL(1時間有効)を取得
  async function getSignedUrl(filePath: string): Promise<string | null> {
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      const { data, error: signError } = await withTimeout(
        supabase.storage.from(BUCKET_NAME).createSignedUrl(filePath, 3600),
        10000,
        'receipt signed url'
      );

      if (signError) {
        throw signError;
      }

      return data?.signedUrl || null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.log('getSignedUrl error:', msg);
      setError(msg);
      return null;
    }
  }

  return {
    uploading,
    error,
    uploadReceipt,
    deleteReceipt,
    getSignedUrl,
  };
}
