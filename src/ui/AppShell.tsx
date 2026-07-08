import { useRef, useState, useEffect, useLayoutEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TabBar, type ActionType } from './components/TabBar';
import { AddEntrySheet, type AddEntryTab } from './components/AddEntrySheet';
import { Toaster, useToast, type ShowToast } from './components/Toaster';
import { ApiKeySheet } from './components/ApiKeySheet';
import { todayISO } from '../data/ids';
import { PREVIEW, repos } from '../state/repos';
import { runMealsMigrationIfNeeded } from '../data/mealsMigration';
import { runDefaultPantrySeedIfNeeded } from '../data/defaultPantrySeed';
import { getHealthKitService } from '../data/healthkit';
import { onRequestApiKeySheet } from '../lib/apiKey';
import { App as CapacitorApp } from '@capacitor/app';

/** Shape shared with screens via the Outlet context. Today reads/sets the
 *  viewed date here so the + Add-entry sheet logs to the day being viewed
 *  (not always today). openAddEntry lets any screen open the sheet on a
 *  specific tab (e.g. tapping the Weight stat tile opens the Weight tab). */
export interface DayContext {
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  /** Opens the Add Entry sheet. Pass `hideTabs: true` to pre-select the tab
   *  and hide the tab bar (same UX as tapping a speed-dial FAB button). */
  openAddEntry: (tab?: AddEntryTab, opts?: { hideTabs?: boolean }) => void;
  showToast: ShowToast;
}

export function AppShell() {
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addEntryInitialTab, setAddEntryInitialTab] = useState<AddEntryTab>('food');
  const [addEntryHideTabs, setAddEntryHideTabs] = useState(false);
  const [addEntryAutoScan, setAddEntryAutoScan] = useState(false);
  const [addEntryInitialScanPhoto, setAddEntryInitialScanPhoto] = useState<string | undefined>();

  // The day currently being viewed (driven by Today's stepper/swipe). Adds go
  // to THIS day, so you can log to past/future days, not only today.
  const [viewedDate, setViewedDate] = useState(todayISO());
  const { toast, showToast, dismissToast } = useToast();
  const [apiKeySheetOpen, setApiKeySheetOpen] = useState(false);

  // Global entry point for the bring-your-own-key sheet — any AI-feature
  // call site (Day's-log basket, Pantry meal builder, DescribeOverlay) can
  // trigger this via requestApiKeySheet() without needing it threaded
  // through props/context. Single instance, mounted once here.
  useEffect(() => onRequestApiKeySheet(() => setApiKeySheetOpen(true)), []);

  // One-time data migrations against the real (Dexie) store — round 123's
  // "Meals in Pantry" foundation, and round 179's default-Pantry seeding.
  // Both run once per device via their own localStorage flag; the preview
  // build boots a fresh in-memory store every load, so there's nothing to
  // migrate/seed there.
  useEffect(() => {
    if (!PREVIEW) {
      void runMealsMigrationIfNeeded();
      void runDefaultPantrySeedIfNeeded();
    }
  }, []);

  // Health sync: quietly on cold launch, and again each time the app comes
  // back to the foreground — never continuous/polling. sync() itself is a
  // safe no-op when not connected or unavailable (web/preview), so this can
  // fire unconditionally. Errors are swallowed — a failed background sync
  // shouldn't surface anywhere; the user can always hit "Sync now" in
  // Account if something seems off.
  useEffect(() => {
    const svc = getHealthKitService(repos);
    void svc.sync().catch(() => { /* best-effort */ });

    let handle: { remove: () => void } | undefined;
    CapacitorApp.addListener('resume', () => {
      void svc.sync().catch(() => { /* best-effort */ });
    }).then((h) => { handle = h; });

    return () => { handle?.remove(); };
  }, []);
  const mainRef = useRef<HTMLElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  // Per-tab scroll position memory: save on scroll, restore on route change.
  const scrollPositions = useRef<Record<string, number>>({});

  const handleMainScroll = useCallback(() => {
    if (mainRef.current) {
      scrollPositions.current[pathname] = mainRef.current.scrollTop;
    }
  }, [pathname]);

  // Restore scroll position after route change, invisibly.
  // Strategy: hide the scroll container before the browser paints (useLayoutEffect),
  // then apply scrollTop and reveal once it sticks. We retry with increasing delays
  // to handle screens whose async content expands the scrollHeight after first paint.
  // The user never sees the page at position 0 — it appears already at the saved spot.
  useLayoutEffect(() => {
    const saved = scrollPositions.current[pathname] ?? 0;
    if (saved === 0) return;
    // Hide before the first paint so the unscrolled position is never visible.
    if (mainRef.current) mainRef.current.style.visibility = 'hidden';
  }, [pathname]);

  useEffect(() => {
    const saved = scrollPositions.current[pathname] ?? 0;
    if (saved === 0) return;

    function attempt(isLast = false) {
      const el = mainRef.current;
      if (!el) return;
      el.scrollTop = saved;
      // Reveal as soon as scroll sticks (scrollTop within 1px of target),
      // or unconditionally on the last attempt to avoid staying hidden forever.
      if (isLast || el.scrollTop >= saved - 1) {
        el.style.visibility = '';
      }
    }

    const t0 = setTimeout(() => attempt(), 0);
    const t1 = setTimeout(() => attempt(), 100);
    const t2 = setTimeout(() => attempt(true), 300);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, [pathname]);

  // Restart the fade-in CSS animation on every route change WITHOUT unmounting
  // the wrapper div. Unmounting via key={pathname} tears down the entire DOM
  // subtree, leaving a blank frame on WKWebView before the new screen's first
  // paint. Keeping the div alive and forcing an animation restart (the
  // animation:none → reflow → animation:'' trick) gives a smooth cross-screen
  // fade with no blank frame in between.
  useEffect(() => {
    const el = fadeRef.current;
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetHeight; // force reflow so the browser registers the removal
    el.style.animation = '';
  }, [pathname]);

  /** Called by FloatingTabBar when the FAB rotation completes — opens the sheet. */
  function handleFabMorphComplete() {
    setAddEntryInitialTab('food');
    setAddEntryHideTabs(false);
    setAddEntryAutoScan(false);
    setAddEntryInitialScanPhoto(undefined);
    setSheetOpen(true);
  }

  function openAddEntry(tab: AddEntryTab = 'food', opts?: { hideTabs?: boolean }) {
    setAddEntryInitialTab(tab);
    setAddEntryHideTabs(opts?.hideTabs ?? false);
    setAddEntryAutoScan(false);
    setAddEntryInitialScanPhoto(undefined);
    setSheetOpen(true);
  }

  /** Routes a FAB speed-dial action to the correct sheet configuration.
   *  Scan opens the sheet immediately; FoodForm handles source selection and
   *  capture internally (showing our own "Take photo / From library" picker
   *  on native, and triggering the file input on web). */
  function handleAction(type: ActionType) {
    if (type === 'scan') {
      setAddEntryInitialScanPhoto(undefined);
      setAddEntryAutoScan(true); // FoodForm shows source picker on native, file input on web
      setAddEntryInitialTab('food');
      setAddEntryHideTabs(true);
    } else {
      setAddEntryInitialTab(type);
      setAddEntryHideTabs(true);
      setAddEntryAutoScan(false);
      setAddEntryInitialScanPhoto(undefined);
    }
    setSheetOpen(true);
  }

  function handleSheetClose() {
    setSheetOpen(false);
  }

  return (
    <div className="flex min-h-[100dvh] justify-center bg-surface-muted sm:items-center sm:py-[max(1.5rem,2dvh)]">
      {/* Phone-first: full-bleed, full height on small screens. On larger
          viewports it settles into a centered, framed device-sized card. */}
      <div className="relative flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-hidden bg-surface-muted sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl">
        {/* Status-bar fade (round 185) — purely visual, sits above every
            screen's scrolling content so nothing runs directly under the
            notch/Dynamic Island unreadably. Taller than the safe area itself
            (+48px) so content fades out gradually rather than cutting off
            sharply — mirrors the bottom nav's own fade in FloatingTabBar.tsx
            (120px vs a ~34px safe-area-inset-bottom). Token-driven background
            so it flips correctly in dark mode. pointer-events-none: purely
            decorative, never blocks the tap-to-top layer below or content
            under it. z-40, same as the tap interceptor — below sheets (z-50),
            above all screen content. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-40"
          style={{
            height: 'calc(env(safe-area-inset-top, 48px) + 48px)',
            background: 'linear-gradient(to bottom, var(--color-surface-muted), transparent)',
          }}
          aria-hidden
        />
        {/* Status-bar scroll-to-top interceptor — a transparent hit-target that
            covers the safe-area / Dynamic Island band. Any tap here scrolls the
            content to the top, matching native iOS behaviour. z-40 sits above
            screen content but below sheets (z-50).
            Round 187 (experiment): added onTouchStart alongside onClick. iOS
            has its own native "tap the status bar to scroll" gesture that gets
            first refusal on touches in this exact strip — by the time a
            synthesized click would fire, that native gesture may have already
            consumed the touch without doing anything useful (it likely targets
            the WKWebView's own outer scroll view, which never moves — our
            actual scrolling happens in the nested <main> below). Firing on
            touchstart instead reacts the instant a finger lands, before that
            native recognizer has time to decide anything. Not guaranteed to
            win the race — this is a real platform limitation, not something
            fully within our control — but worth trying. onClick stays for
            desktop/browser preview, where there's no touch event at all. */}
        <div
          className="pointer-events-auto absolute inset-x-0 top-0 z-40"
          style={{ height: 'env(safe-area-inset-top, 48px)' }}
          onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          onTouchStart={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-hidden
        />
        {/* Bottom padding clears the floating glass tab bar. */}
        <main ref={mainRef} onScroll={handleMainScroll} className="safe-top flex-1 overflow-y-auto pb-28 bg-surface-muted">
          <div ref={fadeRef} className="route-fade-in" role="tabpanel" aria-label="Tab content">
            <Outlet context={{ date: viewedDate, setDate: setViewedDate, openAddEntry, showToast } satisfies DayContext} />
          </div>
        </main>
        <TabBar
          onAction={handleAction}
          onFabMorphComplete={handleFabMorphComplete}
          onTodayDoubleClick={() => setViewedDate(todayISO())}
          onActiveTabDoubleTap={(k) => {
            mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            if (k === '/account') window.dispatchEvent(new CustomEvent('devmenu:reset-tab'));
          }}
        />
        {sheetOpen && (
          <AddEntrySheet
            date={viewedDate}
            onClose={handleSheetClose}
            initialTab={addEntryInitialTab}
            hideTabs={addEntryHideTabs}
            autoScan={addEntryAutoScan}
            initialScanPhoto={addEntryInitialScanPhoto}
            showToast={showToast}
          />
        )}
        <Toaster toast={toast} onDismiss={dismissToast} />
        {apiKeySheetOpen && <ApiKeySheet onClose={() => setApiKeySheetOpen(false)} />}
      </div>
    </div>
  );
}
