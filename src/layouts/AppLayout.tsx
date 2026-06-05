// Phase D-4-e (Step 7.4): タスク管理画面で .content--flush を付与
//   - パスが /tasks 系 → .content の padding/max-width を無効化 → 画面いっぱい使用
// Phase D-4-c (cont.): CheckSquare アイコン追加
// Phase: Googleカレンダー連携後のトースト表示を追加 (?gcal=connected / ?gcal=error)
import { Fragment, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  User,
  Clock,
  ClipboardCheck,
  Globe,
  Briefcase,
  Receipt,
  BarChart3,
  Users,
  Settings,
  CheckSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppUser } from '../lib/useAppUser';
import { NAV_GROUPS } from '../config/navigation';
import type { NavGroup, NavItem } from '../config/navigation';
import './AppLayout.css';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  User,
  Clock,
  ClipboardCheck,
  Globe,
  Briefcase,
  Receipt,
  BarChart3,
  Users,
  Settings,
  CheckSquare,
};

function isGroupActive(group: NavGroup, pathname: string): boolean {
  if (!group.items || group.items.length === 0) return false;
  return group.items.some(
    (it) => it.to && (pathname === it.to || pathname.startsWith(it.to + '/'))
  );
}

function isFlushPage(pathname: string): boolean {
  return pathname.includes('/tasks');
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { appUser } = useAppUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // ===== Google OAuth コールバック検知 (?gcal=connected / ?gcal=error) =====
  const [gcalToast, setGcalToast] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const gcal = params.get('gcal');
    if (!gcal) return;

    if (gcal === 'connected') {
      setGcalToast({
        kind: 'success',
        message: 'Googleカレンダーと連携しました',
      });
    } else if (gcal === 'error') {
      const reason = params.get('reason') ?? 'unknown';
      setGcalToast({
        kind: 'error',
        message: `Googleカレンダー連携に失敗しました (${reason})`,
      });
    }

    params.delete('gcal');
    params.delete('reason');
    const newSearch = params.toString();
    const newUrl =
      location.pathname + (newSearch ? `?${newSearch}` : '') + location.hash;
    window.history.replaceState({}, '', newUrl);

    const timer = setTimeout(() => setGcalToast(null), 5000);
    return () => clearTimeout(timer);
  }, [location.search, location.pathname, location.hash]);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    'ゲスト';
  const isAdmin = appUser?.role === 'admin';

  const visibleGroups = useMemo(
    () => NAV_GROUPS.filter((g) => !g.requireAdmin || isAdmin),
    [isAdmin]
  );

  useEffect(() => {
    for (const g of visibleGroups) {
      if (isGroupActive(g, location.pathname)) {
        setExpandedKey(g.key);
        return;
      }
    }
    setExpandedKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (key: string) => {
    setExpandedKey((cur) => (cur === key ? null : key));
  };

  const onSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const flush = isFlushPage(location.pathname);
  const contentClass = 'content' + (flush ? ' content--flush' : '');

  return (
    <div className={`layout ${collapsed ? 'layout--collapsed' : ''}`}>
      {gcalToast && (
        <div
          className={`gcal-toast gcal-toast--${gcalToast.kind}`}
          role="status"
        >
          <span className="gcal-toast__icon" aria-hidden>
            {gcalToast.kind === 'success' ? '✓' : '⚠'}
          </span>
          <span className="gcal-toast__msg">{gcalToast.message}</span>
          <button
            type="button"
            className="gcal-toast__close"
            onClick={() => setGcalToast(null)}
            aria-label="閉じる"
          >
            ×
          </button>
          <style>{`
            .gcal-toast {
              position: fixed;
              top: 20px;
              left: 50%;
              transform: translateX(-50%);
              z-index: 9999;
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 13px;
              box-shadow: 0 4px 12px rgba(45, 45, 45, 0.15);
              animation: gcalToastIn 200ms ease-out;
              max-width: 90vw;
            }
            .gcal-toast--success {
              background: var(--ok-bg, #EDF3E3);
              color: var(--ok, #6C8F3D);
              border: 1px solid var(--ok, #6C8F3D);
            }
            .gcal-toast--error {
              background: var(--danger-bg, #F4E1DA);
              color: var(--danger, #B5523C);
              border: 1px solid var(--danger, #B5523C);
            }
            .gcal-toast__icon {
              font-weight: 700;
              font-size: 15px;
            }
            .gcal-toast__msg {
              font-weight: 500;
            }
            .gcal-toast__close {
              background: transparent;
              border: none;
              color: inherit;
              font-size: 18px;
              cursor: pointer;
              padding: 0 4px;
              opacity: 0.6;
              line-height: 1;
            }
            .gcal-toast__close:hover {
              opacity: 1;
            }
            @keyframes gcalToastIn {
              from {
                opacity: 0;
                transform: translate(-50%, -8px);
              }
              to {
                opacity: 1;
                transform: translate(-50%, 0);
              }
            }
          `}</style>
        </div>
      )}

      <aside className="sidebar">
        <button
          type="button"
          className="sidebar__brand sidebar__brand--button"
          onClick={() => navigate('/')}
          aria-label="ホームへ"
        >
          {collapsed ? (
            <img
              src="/logomark.png"
              alt="As Partner"
              className="sidebar__brand-logo sidebar__brand-logo--collapsed"
            />
          ) : (
            <>
              <img
                src="/logomark.png"
                alt="As Partner"
                className="sidebar__brand-logo"
              />
              <div className="sidebar__brand-sub">OfficeHub</div>
            </>
          )}
        </button>

        <nav className="sidebar__nav" aria-label="メインナビゲーション">
          {visibleGroups.map((group) => (
            <Fragment key={group.key}>
              {group.dividerBefore && <div className="sidebar__divider" />}
              {renderGroup(
                group,
                expandedKey === group.key,
                isGroupActive(group, location.pathname),
                toggleGroup,
                collapsed
              )}
            </Fragment>
          ))}
        </nav>

        <button
          className="sidebar__collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__left" />
          <div className="topbar__right">
            <span className="topbar__user">{displayName}</span>
            <button className="topbar__signout" onClick={onSignOut}>
              ログアウト
            </button>
          </div>
        </header>
        <main className={contentClass}>
          <Outlet />
        </main>
        {!flush && (
          <footer className="footer">
            <span>© As Partner — OfficeHub</span>
            <span>既存システムとは URL リンクで連携しています</span>
          </footer>
        )}
      </div>
    </div>
  );
}

function renderIcon(group: NavGroup, collapsed: boolean) {
  if (!group.icon) return null;
  const Icon = ICON_MAP[group.icon];
  if (!Icon) return null;
  const size = collapsed ? 20 : 18;
  return (
    <Icon
      size={size}
      color={group.iconColor ?? '#5a6a5a'}
      strokeWidth={2}
      className="sidebar__icon"
      aria-hidden
    />
  );
}

function renderGroup(
  group: NavGroup,
  isOpen: boolean,
  groupActive: boolean,
  toggleGroup: (key: string) => void,
  collapsed: boolean
) {
  if (group.items && group.items.length > 0) {
    return (
      <div
        className={
          'sidebar__group' + (groupActive ? ' sidebar__group--active' : '')
        }
      >
        <button
          type="button"
          className="sidebar__group-header"
          onClick={() => toggleGroup(group.key)}
          title={group.description}
          aria-expanded={isOpen}
        >
          {renderIcon(group, collapsed)}
          {!collapsed && (
            <>
              <span className="sidebar__label">{group.label}</span>
              <span
                className={
                  'sidebar__chevron' +
                  (isOpen ? ' sidebar__chevron--open' : '')
                }
                aria-hidden
              >
                ▾
              </span>
            </>
          )}
        </button>
        {isOpen && !collapsed && (
          <div className="sidebar__group-items">
            {group.items.map((item) => renderItem(item, true))}
          </div>
        )}
      </div>
    );
  }

  return renderSingleLink(group, collapsed);
}

function renderSingleLink(group: NavGroup, collapsed: boolean) {
  const cls = 'sidebar__link';
  if (group.href) {
    return (
      <a
        key={group.key}
        href={group.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        title={group.description}
      >
        {renderIcon(group, collapsed)}
        {!collapsed && (
          <>
            <span className="sidebar__label">{group.label}</span>
            <span className="sidebar__external" aria-label="外部リンク">
              ↗
            </span>
          </>
        )}
      </a>
    );
  }
  return (
    <NavLink
      key={group.key}
      to={group.to ?? '/'}
      end={group.to === '/'}
      className={({ isActive }) =>
        cls + (isActive ? ' sidebar__link--active' : '')
      }
      title={group.description}
    >
      {renderIcon(group, collapsed)}
      {!collapsed && <span className="sidebar__label">{group.label}</span>}
    </NavLink>
  );
}

function renderItem(item: NavItem, isChild: boolean, collapsed?: boolean) {
  const cls = isChild ? 'sidebar__link sidebar__link--child' : 'sidebar__link';

  if (item.href) {
    return (
      <a
        key={item.key}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        title={item.description}
      >
        {!collapsed && (
          <>
            <span className="sidebar__label">{item.label}</span>
            <span className="sidebar__external" aria-label="外部リンク">
              ↗
            </span>
          </>
        )}
      </a>
    );
  }
  return (
    <NavLink
      key={item.key}
      to={item.to ?? '/'}
      end={item.to === '/'}
      className={({ isActive }) =>
        cls + (isActive ? ' sidebar__link--active' : '')
      }
      title={item.description}
    >
      {!collapsed && <span className="sidebar__label">{item.label}</span>}
    </NavLink>
  );
}
