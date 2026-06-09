import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, MessageSquare, Building2,
  CheckSquare, GraduationCap, Calculator, Settings, BarChart3,
  FileType, Globe, QrCode, Home, Lock, ChevronRight, LogOut,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGsapPageTransition } from '@/lib/motion';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useApp } from '@/context/AppContext';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { useChatUnread } from '@/context/ChatUnreadContext';
import { Modal } from '@/components/ui/Modal';

// ─── Nav items definition ─────────────────────────────────────────────────────

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  leadershipOnly?: boolean;
  adminOnly?: boolean;
  locked?: boolean;
}

const NAV_CORE: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/' },
  { icon: Users,           label: 'Clientes',   path: '/clients' },
  { icon: Calendar,        label: 'Agenda',     path: '/schedule' },
  { icon: MessageSquare,   label: 'Chat',       path: '/chat' },
];

const NAV_TOOLS: NavItem[] = [
  { icon: Building2,  label: 'Empreendimentos', path: '/developments' },
  { icon: Globe,      label: 'Portais',         path: '/portals' },
  { icon: QrCode,     label: 'Check-in',        path: '/checkin' },
  { icon: QrCode,     label: 'Tela Check-in',   path: '/checkin/display', adminOnly: true },
  { icon: CheckSquare,label: 'Tarefas',         path: '/tasks' },
  { icon: GraduationCap, label: 'Treinamentos', path: '/training' },
  { icon: FileType,   label: 'Conversor PDF',   path: '/pdf-tools' },
];

const NAV_REPORTS: NavItem[] = [
  { icon: BarChart3,  label: 'Relatórios',       path: '/reports',       leadershipOnly: true },
  { icon: Calculator, label: 'Apuração de Renda', path: '/income',       leadershipOnly: true },
  { icon: Home,       label: 'Amortização',       path: '/amortization', leadershipOnly: true },
];

const NAV_ADMIN: NavItem[] = [
  { icon: Lock, label: 'Painel Admin', path: '/admin', adminOnly: true },
];

// ─── Sidebar nav link ─────────────────────────────────────────────────────────

function SideNavLink({ item, unreadCount = 0 }: { item: NavItem; unreadCount?: number }) {
  const location = useLocation();
  const isActive = item.path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(item.path);

  if (item.locked) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary/70 bg-surface-100/60 cursor-not-allowed">
        <item.icon size={18} strokeWidth={2} />
        <span>{item.label}</span>
        <Lock size={14} className="ml-auto text-text-secondary/70" />
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-gradient-to-r from-primary-600/20 to-primary-500/5 text-primary-200 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.28)]'
          : 'text-text-secondary hover:bg-surface-100 hover:text-text-primary',
      )}
    >
      <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className={cn(isActive ? 'text-primary-400' : 'text-surface-500 group-hover:text-text-primary')} />
      <span>{item.label}</span>
      {unreadCount > 0 && (
        <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      {isActive && unreadCount === 0 && <ChevronRight size={16} className="ml-auto text-primary-400" />}
    </NavLink>
  );
}

// ─── Sidebar group ────────────────────────────────────────────────────────────

function NavGroup({ label, items, chatUnread }: { label: string; items: NavItem[]; chatUnread?: number }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-surface-500 px-3 mb-1.5">{label}</p>
      {items.map(item => <SideNavLink key={item.path} item={item} unreadCount={item.path === '/chat' ? chatUnread : 0} />)}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  const { isAdmin, isDirector, isManager, isCoordinator, isAnalyst, canAccessIncomeAnalysis } = useAuthorization();
  const { userName, profile, signOut } = useApp();
  const { totalUnread } = useChatUnread();
  const navigate = useNavigate();
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  const isLeadership = isAdmin || isDirector || isManager || isCoordinator;
  const isAdminOrDirector = isAdmin || isDirector;

  const canAccessCheckInDisplay = isAdmin || isDirector || isManager;

  const filteredTools = NAV_TOOLS.filter(item => {
    if (item.path === '/checkin/display') return canAccessCheckInDisplay;
    return (!item.leadershipOnly || isLeadership) && (!item.adminOnly || isAdminOrDirector);
  });
  const filteredReports = NAV_REPORTS.filter(item => {
    if (item.path === '/income') return canAccessIncomeAnalysis;
    return !item.leadershipOnly || isLeadership;
  });
  const filteredAdmin = NAV_ADMIN.filter(item => !item.adminOnly || isAdminOrDirector);
  const reportsForRole = isAnalyst
    ? NAV_REPORTS.filter(item => item.path === '/income' && canAccessIncomeAnalysis)
    : filteredReports;

  const handleConfirmLogout = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/login');
    } finally {
      setIsSigningOut(false);
      setIsLogoutConfirmOpen(false);
    }
  };

  const allGroups = isAnalyst
    ? [{ label: 'Análise', items: reportsForRole }]
    : [
      { label: 'Principal', items: NAV_CORE },
      { label: 'Ferramentas', items: filteredTools },
      { label: 'Análise', items: reportsForRole },
      { label: 'Administrativo', items: filteredAdmin },
    ].filter(g => g.items.length > 0);

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 bg-card-bg/95 backdrop-blur-md border-r border-surface-200/80 flex flex-col z-40 print:hidden">
      {/* Brand */}
      <div className="h-16 px-5 flex items-center border-b border-surface-200/80">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white font-black text-base shadow-lg shadow-primary-500/25">K</span>
          <div>
            <h1 className="v3-serif text-text-primary text-lg leading-none tracking-tight">Kaizen</h1>
            <p className="text-[10px] text-primary-400 font-semibold uppercase tracking-[0.24em] mt-0.5">Axis</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
        {allGroups.map(g => (
          <NavGroup key={g.label} label={g.label} items={g.items} chatUnread={totalUnread} />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-surface-200 dark:border-surface-100/10">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-200/10 transition-all group"
        >
          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm flex-shrink-0">
            {(userName || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-text-primary truncate">{userName}</p>
            <p className="text-[10px] text-text-secondary truncate">{profile?.role}</p>
          </div>
          <ChevronRight size={14} className="text-surface-300 group-hover:text-text-secondary transition-colors" />
        </button>
        <button
          onClick={() => setIsLogoutConfirmOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-sm text-text-secondary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
        >
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>

      <Modal
        isOpen={isLogoutConfirmOpen}
        onClose={() => !isSigningOut && setIsLogoutConfirmOpen(false)}
        title="Confirmar saída"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Tem certeza que deseja sair da sua conta?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsLogoutConfirmOpen(false)}
              disabled={isSigningOut}
              className="px-4 py-2 rounded-lg border border-surface-200 text-text-secondary hover:bg-surface-100 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmLogout}
              disabled={isSigningOut}
              className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
            >
              {isSigningOut ? 'Saindo...' : 'Sair agora'}
            </button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}

// ─── Desktop Layout ───────────────────────────────────────────────────────────

export function DesktopLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  // Derive page title from current path
  const pageTitles: Record<string, string> = {
    '/':              'Dashboard',
    '/clients':       'Clientes',
    '/schedule':      'Agenda',
    '/chat':          'Chat',
    '/developments':  'Empreendimentos',
    '/portals':       'Portais',
    '/checkin':       'Check-in',
    '/tasks':         'Tarefas',
    '/training':      'Treinamentos',
    '/pdf-tools':     'Conversor de PDF',
    '/reports':       'Relatórios',
    '/income':        'Apuração de Renda',
    '/amortization':  'Amortização',
    '/admin':         'Painel Administrativo',
    '/settings':      'Configurações',
    '/more':          'Menu',
  };

  const currentTitle = Object.entries(pageTitles)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => location.pathname === path || location.pathname.startsWith(path + '/'))
    ?.[1] ?? 'Kaizen Axis';

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-50 flex">
      <Sidebar />

      {/* Main content */}
      <div className="ml-64 flex-1 flex flex-col min-h-screen">
        {/* Top header */}
        <header className="sticky top-0 z-30 h-16 bg-card-bg/80 backdrop-blur-md border-b border-surface-200/80 flex items-center px-6 gap-4 print:hidden">
          <h2 className="v3-serif text-text-primary text-xl flex-1 tracking-tight">{currentTitle}</h2>
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto print:overflow-visible print:h-auto">
          <div
            ref={useGsapPageTransition<HTMLDivElement>(location.pathname)}
            className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
