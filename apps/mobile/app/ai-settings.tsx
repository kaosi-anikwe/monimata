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
 * AI Settings screen — BYOK credential management + AI efficiency monitor
 * (spec §5.1 – §5.2).
 *
 * Section A — Connected Providers
 *   One card per AiCredentialResponse showing provider name, active status,
 *   and a "Remove" button with confirmation dialog.
 *   Empty state when no credentials exist.
 *   "+ Add Provider" button opens the AddKeySheet.
 *
 * Section B — Run AI Categorisation
 *   Primary Button (variant="lime"). Disabled when no active credential or
 *   no uncategorised transactions. Fires useTriggerLlmCategorization().
 *
 * Section C — AI Efficiency Monitor
 *   AiMonitorPanel component driven by useAiUsage().
 *
 * AddKeySheet (BottomSheet)
 *   Provider picker → Chip group (gemini | openai | anthropic).
 *   API key TextInput (secureTextEntry).
 *   Submit via useAddAiCredential().
 *   Key is sent over HTTPS; backend encrypts at rest — never stored on-device.
 */

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiMonitorPanel, AiMonitorPanelSkeleton } from '@/components/categorization/AiMonitorPanel';
import { useToast } from '@/components/Toast';
import { Badge, BottomSheet, Button, Chip, EmptyState, ScreenHeader, SectionHeader } from '@/components/ui';
import {
  useAddAiCredential,
  useAiCredentials,
  useAiUsage,
  useClusters,
  useDeleteAiCredential,
  useTriggerLlmCategorization,
} from '@/hooks/useCategorization';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import { Ionicons } from '@expo/vector-icons';
import type { components } from '@monimata/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AiCredentialResponse = components['schemas']['AiCredentialResponse'];
type AiProvider = 'gemini' | 'openai' | 'anthropic';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const ALL_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic'];

function providerLabel(p: string): string {
  return PROVIDER_LABELS[p as AiProvider] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

function formatCredDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── AiSettingsScreen ─────────────────────────────────────────────────────────

export default function AiSettingsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { confirm, success: showSuccess } = useToast();

  const { data: credentials = [], isLoading: credsLoading } = useAiCredentials();
  const { data: usageData, isLoading: usageLoading } = useAiUsage();
  const { data: clustersData } = useClusters();

  const addMutation = useAddAiCredential();
  const deleteMutation = useDeleteAiCredential();
  const triggerMutation = useTriggerLlmCategorization();

  // ── Add Key sheet state ─────────────────────────────────────────────────
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null);
  const [apiKey, setApiKey] = useState('');

  // ── Derived values ──────────────────────────────────────────────────────
  const activeCount = credentials.filter((c) => c.is_active).length;
  const totalUncategorised = clustersData?.total_uncategorised ?? 0;
  const triggerDisabled =
    activeCount === 0 ||
    totalUncategorised === 0 ||
    triggerMutation.isPending;

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleRemove(cred: AiCredentialResponse) {
    confirm({
      title: 'Remove API Key',
      message: `Remove your ${providerLabel(cred.provider)} key? AI categorisation will stop until you add a new key.`,
      confirmText: 'Remove',
      confirmStyle: 'destructive',
      onConfirm: () => {
        deleteMutation.mutate(
          { params: { path: { credential_id: cred.id } } },
          {
            onSuccess: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        );
      },
    });
  }

  function handleAddSubmit() {
    if (!selectedProvider || !apiKey.trim()) return;
    addMutation.mutate(
      { body: { provider: selectedProvider, api_key: apiKey.trim() } },
      {
        onSuccess: () => {
          setAddSheetVisible(false);
          setSelectedProvider(null);
          setApiKey('');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    );
  }

  function handleTrigger() {
    triggerMutation.mutate(
      {},
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showSuccess(
            'AI Categorisation Queued',
            "You'll be notified when it's done.",
          );
        },
      },
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <ScreenHeader
        title="AI Categorisation"
        onBack={() => router.back()}
        paddingTop={insets.top + spacing.md}
      />

      <ScrollView
        contentContainerStyle={[
          ss.scrollContent,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Section A: Connected Providers ── */}
        <SectionHeader
          title="Connected Providers"
          variant="group"
          paddingHorizontal={spacing.xl}
          style={ss.sectionHeader}
        />

        {!credsLoading && credentials.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="key-outline" size={36} color={colors.textMeta} />}
            title="No AI provider connected"
            body="Add a key to enable Tier 3 categorisation for transactions the offline engine can't match."
            style={ss.credEmptyState}
          />
        ) : (
          <View style={ss.credList}>
            {credentials.map((cred) => (
              <CredentialCard
                key={cred.id}
                cred={cred}
                onRemove={() => handleRemove(cred)}
                isRemoving={deleteMutation.isPending}
              />
            ))}
          </View>
        )}

        {/* Add Provider button */}
        <View style={ss.addBtnWrap}>
          <Button
            variant="green"
            onPress={() => setAddSheetVisible(true)}
            accessibilityLabel="Add AI provider"
          >
            + Add Provider
          </Button>
        </View>

        {/* ── Section B: Run AI Categorisation ── */}
        <SectionHeader
          title="Run AI Categorisation"
          variant="group"
          paddingHorizontal={spacing.xl}
          style={ss.sectionHeader}
        />

        <View style={ss.triggerSection}>
          {activeCount === 0 && (
            <Text style={[type_.small, { color: colors.textMeta, marginBottom: spacing.md }]}>
              Add an active API key to enable this feature.
            </Text>
          )}
          {activeCount > 0 && totalUncategorised === 0 && (
            <Text style={[type_.small, { color: colors.textMeta, marginBottom: spacing.md }]}>
              All transactions are already categorised.
            </Text>
          )}
          <Button
            variant="lime"
            onPress={handleTrigger}
            disabled={triggerDisabled}
            loading={triggerMutation.isPending}
            accessibilityLabel="Run AI categorisation now"
          >
            Run AI Categorisation Now
          </Button>
        </View>

        {/* ── Section C: AI Efficiency Monitor ── */}
        {(usageData || usageLoading) && (
          <>
            <SectionHeader
              title="Efficiency Monitor"
              variant="group"
              paddingHorizontal={spacing.xl}
              style={ss.sectionHeader}
            />
            <View style={ss.monitorWrap}>
              {usageData ? <AiMonitorPanel data={usageData} /> : <AiMonitorPanelSkeleton />}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Add Key bottom sheet ── */}
      <BottomSheet
        visible={addSheetVisible}
        onClose={() => {
          setAddSheetVisible(false);
          setSelectedProvider(null);
          setApiKey('');
        }}
        title="Add AI Provider"
        scrollable={false}
      >
        {/* Provider picker */}
        <Text
          style={[
            type_.labelSm,
            {
              color: colors.textMeta,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginHorizontal: spacing.xl,
              marginBottom: spacing.sm,
            },
          ]}
        >
          Provider
        </Text>
        <View style={[ss.providerChips]}>
          {ALL_PROVIDERS.map((p) => (
            <Chip
              key={p}
              label={PROVIDER_LABELS[p]}
              selected={selectedProvider === p}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedProvider(p);
              }}
              accessibilityLabel={PROVIDER_LABELS[p]}
            />
          ))}
        </View>

        {/* API key input */}
        <Text
          style={[
            type_.labelSm,
            {
              color: colors.textMeta,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginHorizontal: spacing.xl,
              marginTop: spacing.lg,
              marginBottom: spacing.sm,
            },
          ]}
        >
          API Key
        </Text>
        <View
          style={[
            ss.keyInputWrap,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Paste your API key here"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCorrect={false}
            autoCapitalize="none"
            style={[ss.keyInput, { color: colors.textPrimary }]}
            accessibilityLabel="API key input"
            accessibilityHint="Your key is transmitted over HTTPS and encrypted at rest"
          />
        </View>

        {/* Submit */}
        <View style={ss.sheetSubmitWrap}>
          <Button
            variant="lime"
            onPress={handleAddSubmit}
            disabled={!selectedProvider || apiKey.trim().length === 0 || addMutation.isPending}
            loading={addMutation.isPending}
            accessibilityLabel="Save API key"
          >
            Save Key
          </Button>
        </View>
      </BottomSheet>
    </View>
  );
}

// ─── CredentialCard ───────────────────────────────────────────────────────────

interface CredentialCardProps {
  cred: AiCredentialResponse;
  onRemove: () => void;
  isRemoving: boolean;
}

function CredentialCard({ cred, onRemove, isRemoving }: CredentialCardProps) {
  const colors = useTheme();
  return (
    <View
      style={[
        ss.credCard,
        shadow.sm,
        { backgroundColor: colors.cardBg },
      ]}
    >
      {/* Header: provider name + active badge */}
      <View style={ss.credCardHeader}>
        <Text
          style={[type_.h3, { color: colors.textPrimary, flex: 1 }]}
          numberOfLines={1}
        >
          {providerLabel(cred.provider)}
        </Text>
        <Badge
          variant={cred.is_active ? 'success' : 'neutral'}
          size="sm"
        >
          {cred.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </View>

      {/* Date added */}
      <Text style={[type_.caption, { color: colors.textMeta, marginTop: spacing.xs }]}>
        Added {formatCredDate(cred.created_at)}
      </Text>

      {/* Remove button */}
      <TouchableOpacity
        style={ss.removeBtn}
        onPress={onRemove}
        disabled={isRemoving}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${providerLabel(cred.provider)} key`}
      >
        <Text style={[type_.small, { color: colors.error }]}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },

  scrollContent: {
    paddingTop: spacing.lg,
  },

  sectionHeader: {
    paddingTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  // Section A
  credList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  credEmptyState: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  credCard: {
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  credCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  removeBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  addBtnWrap: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },

  // Section B
  triggerSection: {
    paddingHorizontal: spacing.xl,
  },

  // Section C
  monitorWrap: {
    paddingHorizontal: spacing.xl,
  },

  // Add Key sheet
  providerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  keyInputWrap: {
    marginHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  keyInput: {
    ...type_.body,
    padding: 0,
  },
  sheetSubmitWrap: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
