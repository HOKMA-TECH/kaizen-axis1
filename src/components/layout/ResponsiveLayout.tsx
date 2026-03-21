import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { DesktopLayout } from './DesktopLayout';

const DESKTOP_BREAKPOINT = 1024; // lg

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  return isDesktop
    ? <DesktopLayout>{children}</DesktopLayout>
    : <Layout>{children}</Layout>;
}
