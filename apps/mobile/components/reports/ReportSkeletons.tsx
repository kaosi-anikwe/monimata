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
 * components/reports/ReportSkeletons.tsx
 *
 * Shimmer loading skeletons for each report card / screen section.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Skeleton } from '@/components/ui';
import { radius, spacing } from '@/lib/tokens';

/** Skeleton for the main dashboard snapshot card. */
export function SnapshotSkeleton() {
  return (
    <Card style={ss.card}>
      <Skeleton width="40%" height={16} />
      <View style={ss.spacerMd} />
      <View style={ss.row}>
        <Skeleton width="35%" height={22} />
        <Skeleton width={60} height={20} borderRadius={radius.full} />
      </View>
      <View style={ss.spacerSm} />
      <View style={ss.row}>
        <Skeleton width="35%" height={22} />
        <Skeleton width={60} height={20} borderRadius={radius.full} />
      </View>
      <View style={ss.spacerSm} />
      <Skeleton width="60%" height={16} />
      <View style={ss.spacerSm} />
      <Skeleton width="30%" height={14} />
    </Card>
  );
}

/** Skeleton for a stat card (age of money, net worth). */
export function StatCardSkeleton() {
  return (
    <Card style={ss.card}>
      <Skeleton width="50%" height={14} />
      <View style={ss.spacerMd} />
      <Skeleton width="40%" height={28} />
      <View style={ss.spacerSm} />
      <Skeleton width="70%" height={12} />
    </Card>
  );
}

/** Skeleton for a list row (merchants, categories). */
export function ListRowSkeleton() {
  return (
    <View style={ss.listRow}>
      <Skeleton width={36} height={36} borderRadius={radius.sm} />
      <View style={ss.listRowText}>
        <Skeleton width="60%" height={14} />
        <View style={ss.spacerXs} />
        <Skeleton width="40%" height={12} />
      </View>
      <Skeleton width={70} height={16} />
    </View>
  );
}

/** Multiple ListRowSkeletons. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </View>
  );
}

/** Skeleton for chart area. */
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <Card style={ss.card}>
      <Skeleton width="100%" height={height} borderRadius={radius.sm} />
    </Card>
  );
}

/** Skeleton for budget performance rows. */
export function BudgetRowSkeleton() {
  return (
    <View style={ss.budgetRow}>
      <Skeleton width="45%" height={14} />
      <View style={ss.spacerXs} />
      <Skeleton width="100%" height={6} borderRadius={radius.xxs} />
      <View style={ss.spacerXs} />
      <Skeleton width="30%" height={12} />
    </View>
  );
}

const ss = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  spacerXs: { height: spacing.xxs },
  spacerSm: { height: spacing.xs },
  spacerMd: { height: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  listRowText: {
    flex: 1,
  },
  budgetRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
