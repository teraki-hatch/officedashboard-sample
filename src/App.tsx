// Phase D-4-c: TaskPage → TaskBoardPage に差し替え
// 2026-05-29: 管理者用 経費一覧ページ (/admin/expense-list) を追加
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { KintaiPage } from './pages/KintaiPage';
import { KousuPage } from './pages/KousuPage';
import { ApplicationPage } from './pages/ApplicationPage';
import { ClientsPage } from './pages/ClientsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { EmployeeDetailPage } from './pages/EmployeeDetailPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import { ExpensePage } from './pages/ExpensePage';
import { SettingsPage } from './pages/SettingsPage';
import { PortalLinks } from './pages/PortalLinks';
import { NotFoundPage } from './pages/NotFoundPage';

// 大改修で新設したページ
import { MyPage } from './pages/MyPage';
import { BoardPage } from './pages/BoardPage';
import { SalesDashboardPage } from './pages/SalesDashboardPage';

// Phase D-4: TaskBoard 内装
import { TaskBoardPage } from './features/tasks/TaskBoardPage';

// 勤怠管理系の admin ページ分割 (2026-05-22)
import { LeaveManagementPage } from './pages/LeaveManagementPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { MonthlyClosurePage } from './pages/MonthlyClosurePage';
import { AttendancePdfPage } from './pages/AttendancePdfPage';
import { MemberAttendancePage } from './pages/MemberAttendancePage';

// 管理者用 経費一覧 (2026-05-29)
import { AdminExpenseListPage } from './pages/AdminExpenseListPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered-loader">読み込み中...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          {/* ===== 1. ホーム ===== */}
          <Route index element={<HomePage />} />

          {/* ===== 2. マイページ ===== */}
          <Route path="me" element={<MyPage />} />

          {/* ===== 3. 営業・案件 ===== */}
          <Route path="sales/clients" element={<ClientsPage />} />
          <Route path="sales/clients/:id" element={<ClientDetailPage />} />
          <Route path="sales/deals" element={<Navigate to="/sales/clients" replace />} />
          <Route path="sales/dashboard" element={<SalesDashboardPage />} />
          <Route path="sales/tasks" element={<TaskBoardPage />} />

          {/* ===== 4. 勤怠・工数 ===== */}
          <Route path="work/kintai" element={<KintaiPage />} />
          <Route path="work/kousu" element={<KousuPage />} />

          {/* ===== 5. 申請・承認 ===== */}
          <Route path="requests" element={<ApplicationPage />} />

          {/* ===== 6. 請求・経費 ===== */}
          <Route path="billing/expenses" element={<ExpensePage />} />
          <Route path="billing/invoices" element={<InvoicesPage />} />
          <Route path="billing/invoices/:id" element={<InvoiceDetailPage />} />

          {/* ===== 7. 経営ボード ===== */}
          <Route path="board" element={<BoardPage />} />

          {/* ===== 8. 社員・組織 ===== */}
          <Route path="org/employees" element={<EmployeesPage />} />
          <Route path="org/employees/:id" element={<EmployeeDetailPage />} />
          <Route path="org/leave" element={<LeaveManagementPage />} />

          {/* ===== 9. ポータル ===== */}
          <Route path="portal" element={<PortalLinks />} />

          {/* ===== 10. 管理設定 ===== */}
          <Route path="admin/settings" element={<SettingsPage />} />
          <Route path="admin/approval" element={<ApprovalPage />} />
          <Route path="admin/member-attendance" element={<MemberAttendancePage />} />
          <Route path="admin/expense-list" element={<AdminExpenseListPage />} />
          <Route path="admin/closure" element={<MonthlyClosurePage />} />
          <Route path="admin/attendance-pdf" element={<AttendancePdfPage />} />

          {/* ===== 旧URL互換リダイレクト ===== */}
          <Route path="kintai" element={<Navigate to="/work/kintai" replace />} />
          <Route path="kousu" element={<Navigate to="/work/kousu" replace />} />
          <Route path="task" element={<Navigate to="/sales/tasks" replace />} />
          <Route path="performance" element={<Navigate to="/board" replace />} />
          <Route path="profitability" element={<Navigate to="/board" replace />} />
          <Route path="clients" element={<Navigate to="/sales/clients" replace />} />
          <Route path="clients/:id" element={<RedirectClientDetail />} />
          <Route path="employees" element={<Navigate to="/org/employees" replace />} />
          <Route path="employees/:id" element={<RedirectEmployeeDetail />} />
          <Route path="invoices" element={<Navigate to="/billing/invoices" replace />} />
          <Route path="invoices/:id" element={<RedirectInvoiceDetail />} />
          <Route path="expenses" element={<Navigate to="/billing/expenses" replace />} />
          <Route path="settings" element={<Navigate to="/admin/settings" replace />} />
          {/* 旧マスタ管理URLは sales/clients or org/employees にリダイレクト */}
          <Route path="admin/master" element={<Navigate to="/sales/clients" replace />} />
          <Route path="master" element={<Navigate to="/sales/clients" replace />} />
          <Route path="master/clients/:id" element={<RedirectClientDetail />} />
          <Route path="master/employees/:id" element={<RedirectEmployeeDetail />} />
          <Route path="check" element={<Navigate to="/" replace />} />
          <Route path="applications" element={<Navigate to="/requests" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

// パラメータ付き旧URLは関数コンポーネント経由でリダイレクト
import { useParams } from 'react-router-dom';

function RedirectClientDetail() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/sales/clients/${id}`} replace />;
}
function RedirectEmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/org/employees/${id}`} replace />;
}
function RedirectInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/billing/invoices/${id}`} replace />;
}
