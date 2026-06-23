import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './ui/AppShell';
import { TodayScreen } from './ui/screens/TodayScreen';
import { GoalScreen } from './ui/screens/GoalScreen';
import { PantryScreen } from './ui/screens/PantryScreen';
import { AccountScreen } from './ui/screens/AccountScreen';
import { GoalSetupScreen } from './ui/screens/GoalSetupScreen';
import { PastGoalsScreen, PastGoalDetailScreen } from './ui/screens/PastGoalsScreen';
import { OnboardingScreen } from './ui/screens/OnboardingScreen';
import OnboardingDailyAllowance from './ui/screens/OnboardingDailyAllowance';
import { StyleguideScreen } from './ui/screens/StyleguideScreen';
import { GoalForkScreen } from './ui/screens/FirstOpenFork';
import { hasSeenOnboarding } from './lib/onboarding';

/** First launch → /onboarding; returning user → /today. */
function DefaultRedirect() {
  return <Navigate to={hasSeenOnboarding() ? '/today' : '/onboarding'} replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Full-screen flows — no tab bar */}
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="/onboarding2" element={<OnboardingDailyAllowance />} />
      <Route path="/goal-setup" element={<GoalSetupScreen />} />
      <Route path="/goal-fork" element={<GoalForkScreen />} />
      {/* Past goals — full-screen push navigation (no tab bar) */}
      <Route path="/past-goals" element={<PastGoalsScreen />} />
      <Route path="/past-goals/:id" element={<PastGoalDetailScreen />} />
      {/* Design-system gallery (dev reference) */}
      <Route path="/styleguide" element={<StyleguideScreen />} />
      {/* Tabbed app */}
      <Route element={<AppShell />}>
        <Route path="/today" element={<TodayScreen />} />
        <Route path="/goal" element={<GoalScreen />} />
        <Route path="/pantry" element={<PantryScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="*" element={<DefaultRedirect />} />
      </Route>
    </Routes>
  );
}
