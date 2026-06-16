import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FloatingTabBar, type TabItem, type ActionType } from '../kit';
export type { ActionType };

/* Router-bound wrapper around the kit's FloatingTabBar (the glass floating
   nav). Maps the active route to the selected tab and routes on select; the
   central FAB opens the Add-entry sheet via onAdd. Double-tap Today resets
   the viewed date to today via onTodayDoubleClick. */
const TABS: TabItem[] = [
  { key: '/today', label: 'Diary', icon: 'today' },
  { key: '/goal', label: 'Goal', icon: 'goal' },
  { key: '/pantry', label: 'Pantry', icon: 'pantry' },
  { key: '/account', label: 'Account', icon: 'account' },
];

export function TabBar({
  onAction,
  onTodayDoubleClick,
  onActiveTabDoubleTap,
}: {
  onAction: (type: ActionType) => void;
  onTodayDoubleClick: () => void;
  onActiveTabDoubleTap: (key: string) => void;
}) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const active = TABS.find((t) => pathname.startsWith(t.key))?.key ?? '/today';
  const lastTapRef = useRef<{ key: string; time: number } | null>(null);

  const handleSelect = (k: string) => {
    const now = Date.now();
    const isDoubleTap = k === active && lastTapRef.current?.key === k && now - lastTapRef.current.time < 300;
    lastTapRef.current = { key: k, time: now };

    if (isDoubleTap) {
      if (k === '/today') onTodayDoubleClick();
      onActiveTabDoubleTap(k);
    } else {
      nav(k);
    }
  };

  return <FloatingTabBar items={TABS} active={active} onSelect={handleSelect} onAction={onAction} />;
}
