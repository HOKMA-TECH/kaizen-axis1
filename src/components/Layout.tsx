import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, MessageSquare, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useChatUnread } from '@/context/ChatUnreadContext';

/** Detecta se o teclado virtual está aberto no iOS via visualViewport */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setOpen(vv.height < window.innerHeight * 0.75);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);
  return open;
}

export const BottomNav = () => {
  const location = useLocation();
  const { isBroker, isManager, isCoordinator, canAccessAdmin } = useAuthorization();
  const keyboardOpen = useKeyboardOpen();
  const { totalUnread } = useChatUnread();

  // Build nav items based on role
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Clientes', path: '/clients' },
    { icon: Calendar, label: 'Agenda', path: '/schedule' },
    { icon: MessageSquare, label: 'Chat', path: '/chat' },
    { icon: Menu, label: 'Mais', path: '/more' },
  ];

  return (
    <div className={cn("fixed bottom-0 left-0 right-0 bg-card-bg border-t border-surface-200 pb-safe pt-2 px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50 print:hidden", keyboardOpen && "hidden")}>
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-300 w-16",
                isActive ? "text-gold-600 dark:text-gold-400" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <div className="relative">
                <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                {item.path === '/chat' && totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold-500"
                  />
                )}
              </div>
              <span className="text-[10px] font-medium mt-1">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};

export const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-surface-50 pb-24 max-w-md mx-auto shadow-2xl shadow-black/5 relative overflow-x-hidden print:pb-0 print:max-w-none print:shadow-none print:bg-white print:overflow-visible print:px-4">
      <main className="h-full overflow-y-auto overflow-x-hidden no-scrollbar print:overflow-visible print:h-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  );
};

export const FAB = ({ onClick, icon: Icon }: { onClick?: () => void, icon?: React.ElementType }) => {
  const DefaultIcon = () => <span className="text-xl font-bold">+</span>;
  const IconComp = Icon ?? DefaultIcon;
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="fixed bottom-24 right-6 w-14 h-14 bg-gold-400 text-white rounded-full shadow-lg shadow-gold-400/30 flex items-center justify-center z-40 cursor-pointer print:hidden"
    >
      <IconComp size={24} />
    </motion.button>
  );
};
