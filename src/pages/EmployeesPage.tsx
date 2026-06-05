import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import './EmployeesPage.css';

type EmployeeRow = {
  id: string;
  employee_code: string;
  name: string;
  email: string | null;
  role: string | null;
  status: string;
  employment_type: string | null;
  joined_at: string | null;
  has_salary: boolean;
};

export function EmployeesPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [showInactive, setShowInactive] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = getSupabase();
      if (!supabase) {
        if (alive) {
          setError('Supabase未設定');
          setLoading(false);
        }
        return;
      }

      try {
        const usersRes = await withTimeout(
          supabase
            .from('users')
            .select(
              'id, employee_code, name, email, role, status, employment_type, joined_at'
            )
            .neq('employee_code', '999')
            .order('employee_code', { ascending: true }),
          10000,
          'fetch users'
        );

        if (usersRes.error) throw usersRes.error;

        const salaryRes = await withTimeout(
          supabase.from('employee_salary_master').select('user_id'),
          10000,
          'fetch salary master'
        );

        if (salaryRes.error) throw salaryRes.error;

        const salaryUserIds = new Set<string>(
          (salaryRes.data || []).map((r: { user_id: string }) => r.user_id)
        );

        const rows: EmployeeRow[] = (usersRes.data || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (u: any) => ({
            id: u.id,
            employee_code: u.employee_code || '',
            name: u.name || '',
            email: u.email || null,
            role: u.role || null,
            status: u.status || 'active',
            employment_type: u.employment_type || null,
            joined_at: u.joined_at || null,
            has_salary: salaryUserIds.has(u.id),
          })
        );

        if (alive) {
          setEmployees(rows);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setError((e as any).message || 'データ取得エラー');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const isInactive = e.status === 'inactive';
      if (!showInactive && isInactive) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, showInactive]);

  function handleRowClick(id: string) {
    navigate('/employees/' + id);
  }

  return (
    <div className="employees-page">
      <header className="employees-page__header">
        <div>
          <h1 className="employees-page__title">社員マスタ</h1>
          <p className="employees-page__subtitle">
            社員情報・給与マスタを管理します
          </p>
        </div>
      </header>

      <div className="employees-page__toolbar">
        <input
          type="search"
          className="employees-page__search"
          placeholder="🔍 社員番号・氏名・メールで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="employees-page__toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          退職者も表示
        </label>
      </div>

      {error && <div className="employees-page__error">エラー: {error}</div>}

      <div className="employees-page__table-wrap">
        <table className="employees-page__table">
          <thead>
            <tr>
              <th className="employees-page__th employees-page__th--code">
                社員番号
              </th>
              <th className="employees-page__th">氏名</th>
              <th className="employees-page__th">メール</th>
              <th className="employees-page__th employees-page__th--type">
                雇用形態
              </th>
              <th className="employees-page__th employees-page__th--role">
                権限
              </th>
              <th className="employees-page__th employees-page__th--date">
                入社日
              </th>
              <th className="employees-page__th employees-page__th--salary">
                給与マスタ
              </th>
              <th className="employees-page__th employees-page__th--status">
                状態
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="employees-page__empty">
                  読み込み中...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="employees-page__empty">
                  該当する社員がいません
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr
                  key={e.id}
                  className="employees-page__row"
                  onClick={() => handleRowClick(e.id)}
                >
                  <td className="employees-page__td employees-page__td--code">
                    {e.employee_code}
                  </td>
                  <td className="employees-page__td employees-page__td--name">
                    {e.name}
                  </td>
                  <td className="employees-page__td">
                    {e.email || (
                      <span className="employees-page__mute">—</span>
                    )}
                  </td>
                  <td className="employees-page__td">
                    {e.employment_type || (
                      <span className="employees-page__mute">—</span>
                    )}
                  </td>
                  <td className="employees-page__td">
                    {e.role === 'admin' ? (
                      <span className="employees-page__badge employees-page__badge--admin">
                        admin
                      </span>
                    ) : e.role === 'project_manager' ? (
                      <span className="employees-page__badge employees-page__badge--pm">
                        PM
                      </span>
                    ) : (
                      <span className="employees-page__mute">一般</span>
                    )}
                  </td>
                  <td className="employees-page__td">
                    {e.joined_at ? (
                      e.joined_at.slice(0, 10)
                    ) : (
                      <span className="employees-page__mute">—</span>
                    )}
                  </td>
                  <td className="employees-page__td">
                    {e.has_salary ? (
                      <span className="employees-page__badge employees-page__badge--ok">
                        登録済
                      </span>
                    ) : (
                      <span className="employees-page__badge employees-page__badge--pending">
                        未登録
                      </span>
                    )}
                  </td>
                  <td className="employees-page__td">
                    {e.status === 'inactive' ? (
                      <span className="employees-page__badge employees-page__badge--inactive">
                        退職
                      </span>
                    ) : (
                      <span className="employees-page__badge employees-page__badge--active">
                        在籍
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EmployeesPage;
