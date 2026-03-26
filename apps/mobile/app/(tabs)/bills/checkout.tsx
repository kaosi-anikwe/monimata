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

import React from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useBillsFlow } from './_layout';
import { DetailHeader, ss } from './_components';

export default function CheckoutScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();

  // Should always be set when this screen is pushed, but guard defensively.
  if (!flow.checkoutUrl) return null;

  return (
    <View style={[ss.screenFlex, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <DetailHeader
        title="Secure Checkout"
        step="webview"
        onBack={() => router.back()}
      />
      <WebView
        source={{ uri: flow.checkoutUrl }}
        onShouldStartLoadWithRequest={(request) => {
          // iOS: intercepts user-initiated and JS navigations before they load.
          if (request.url.includes('/bills/callback')) {
            router.replace('/bills/processing');
            return false;
          }
          return true;
        }}
        onNavigationStateChange={(navState) => {
          // Android: server-side 3xx redirects bypass onShouldStartLoadWithRequest,
          // so we catch them here. Replacing checkout with processing means back
          // from processing naturally returns to confirm.
          if (navState.url.includes('/bills/callback')) {
            router.replace('/bills/processing');
          }
        }}
        onLoadStart={(e) => {
          if (!e.nativeEvent.url.includes('/bills/callback')) {
            flow.setWebViewLoading(true);
          }
        }}
        onLoadEnd={() => flow.setWebViewLoading(false)}
      />
      {flow.webViewLoading && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.background,
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}
        >
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      )}
    </View>
  );
}
