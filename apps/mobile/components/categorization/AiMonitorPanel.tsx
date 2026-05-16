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
 * AiMonitorPanel
 *
 * AI efficiency stats panel (spec §8.3). Self-contained — receives a single
 * `data: AiUsageResponse` prop and renders the full monitor layout.
 *
 * Layout (top → bottom):
 *   "AI SYSTEM EFFICIENCY MONITOR" label
 *   Two side-by-side stat columns:
 *     Left  — Offline Engine (offline_success_rate %)
 *     Right — AI Handled     (llm_handled_pct %)
 *   Each column has:
 *     • Large percentage label  (type_.displaySm)
 *     • Mini animated progress bar (ProgressBar with animate)
 *     • Sub-label (type_.caption, colors.textMeta)
 *   ── divider ──
 *   Token rows:
 *     • "This month: N tokens (N calls)"
 *     • "Lifetime:   N tokens"
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import type { components } from '@monimata/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AiUsageResponse = components['schemas']['AiUsageResponse'];

export interface AiMonitorPanelProps {
  data: AiUsageResponse;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  return n.toLocaleString('en-NG');
}

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

// ─── AiMonitorPanel ───────────────────────────────────────────────────────────

export function AiMonitorPanel({ data }: AiMonitorPanelProps) {
  const colors = useTheme();

  const offlineProgress = Math.min(data.offline_success_rate / 100, 1);
  const llmProgress = Math.min(data.llm_handled_pct / 100, 1);

  return (
    <View
      style={[
        ss.panel,
        shadow.sm,
        { backgroundColor: colors.surface },
      ]}
    >
      {/* ── Panel header ── */}
      <Text
        style={[
          type_.labelSm,
          {
            color: colors.textMeta,
            textTransform: 'uppercase',
            letterSpacing: 1.1,
            marginBottom: spacing.lg,
          },
        ]}
      >
        AI System Efficiency Monitor
      </Text>

      {/* ── Two side-by-side stat columns ── */}
      <View style={ss.statsRow}>
        {/* Left — Offline Engine */}
        <View style={[ss.statCol, { borderRightColor: colors.separator }]}>
          <Text style={[type_.displaySm, { color: colors.textPrimary }]}>
            {fmtPct(data.offline_success_rate)}
          </Text>
          <View style={ss.barWrap}>
            <ProgressBar
              progress={offlineProgress}
              state="ok"
              size="sm"
              animate
              style={ss.bar}
            />
          </View>
          <Text style={[type_.caption, { color: colors.textMeta }]}>
            Offline Engine
          </Text>
        </View>

        {/* Right — AI Handled */}
        <View style={ss.statCol}>
          <Text style={[type_.displaySm, { color: colors.textPrimary }]}>
            {fmtPct(data.llm_handled_pct)}
          </Text>
          <View style={ss.barWrap}>
            <ProgressBar
              progress={llmProgress}
              state="brand"
              size="sm"
              animate
              style={ss.bar}
            />
          </View>
          <Text style={[type_.caption, { color: colors.textMeta }]}>
            AI Handled
          </Text>
        </View>
      </View>

      {/* ── Divider ── */}
      <View style={[ss.divider, { backgroundColor: colors.separator }]} />

      {/* ── Token summary rows ── */}
      <View style={ss.tokenRows}>
        <View style={ss.tokenRow}>
          <Text style={[type_.label, { color: colors.textPrimary }]}>
            This month
          </Text>
          <Text style={[type_.caption, { color: colors.textMeta }]}>
            {fmtTokens(data.current_month_total_tokens)} tokens
            {' '}({data.current_month_calls} calls)
          </Text>
        </View>

        <View style={ss.tokenRow}>
          <Text style={[type_.label, { color: colors.textPrimary }]}>
            Lifetime
          </Text>
          <Text style={[type_.caption, { color: colors.textMeta }]}>
            {fmtTokens(data.lifetime_total_tokens)} tokens
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  panel: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  statCol: {
    flex: 1,
    paddingRight: spacing.lg,
    borderRightWidth: StyleSheet.hairlineWidth,
    // The right column has no border — only the left one gets the divider.
  },
  barWrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  bar: {
    // ProgressBar is full-width of its container.
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  tokenRows: {
    gap: spacing.sm,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
