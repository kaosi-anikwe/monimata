// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Auth stack layout — wraps Register, Login, BVN Verify, Link Bank screens.
 *
 * If the user is already authenticated and has completed onboarding, redirect
 * them straight to (tabs). This handles the case where markOnboarded() is
 * dispatched from any screen in this stack (e.g. budget-seed) — the layout
 * re-renders on Redux state change and the Redirect fires immediately.
 */
import { Redirect, Stack, usePathname } from 'expo-router';

import { useAppSelector } from '@/store/hooks';

export default function AuthLayout() {
  const { isAuthenticated, user } = useAppSelector((s) => s.auth);
  const pathname = usePathname();

  // Allow verify-bvn and link-bank even after onboarding — accessible from the profile/accounts screens
  const allowAfterOnboarding = pathname.includes('verify-bvn') || pathname.includes('link-bank');

  if (isAuthenticated && (user?.onboarded ?? false) && !allowAfterOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
