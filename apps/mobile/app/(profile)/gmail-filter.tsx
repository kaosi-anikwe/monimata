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
 * Gmail Filter Setup screen
 *
 * Lets the user pick which supported banks to include, then downloads a Gmail
 * filter XML file they can import in Gmail Settings (web only).
 *
 * Pre-requisite advisory: the user must have already added their MoniMata
 * forwarding address (<username>@monimata.ng) as an approved forwarding
 * address in Gmail before filters will work.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { Button, ScreenHeader, SectionHeader } from '@/components/ui';
import { fetchGmailFilterXml, saveGmailFilterXml, useSupportedBanks } from '@/hooks/useAccounts';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { useAppSelector } from '@/store/hooks';

/** Blog post that walks through the full Gmail forwarding setup. */
const GMAIL_SETUP_GUIDE_URL = 'https://monimata.ng/guides/email-setup';

// ─── Step pill ───────────────────────────────────────────────────────────────

function StepPill({ n, label }: { n: number; label: string }) {
  const colors = useTheme();
  return (
    <View style={sp.row}>
      <View style={[sp.bubble, { backgroundColor: colors.brand }]}>
        <Text style={[sp.num, { color: colors.white }]}>{n}</Text>
      </View>
      <Text style={[sp.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.mdn },
  bubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  num: { ...type_.caption, ...ff(700), lineHeight: 14 },
  label: { ...type_.bodyReg, flex: 1, lineHeight: 22 },
});

// ─── Main screen ─────────────────────────────────────────────="────────────────

export default function GmailFilterScreen() {
  const colors = useTheme();
  const ss = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { error: showError, success: showSuccess, confirm } = useToast();

  const { user } = useAppSelector((s) => s.auth);
  const forwardingAddress = user?.username ? `${user.username}@monimata.ng` : null;

  const { data: allBanks = [], isLoading: banksLoading } = useSupportedBanks();
  const emailBanks = (allBanks as { slug: string; name: string; channels: string[] }[])
    .filter((b) => b.channels.includes('email'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggleBank(slug: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
    setDownloaded(false);
  }

  function selectAll() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(new Set(emailBanks.map((b) => b.slug)));
    setDownloaded(false);
  }

  function clearAll() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(new Set());
    setDownloaded(false);
  }

  async function handleCopyAddress() {
    if (!forwardingAddress) return;
    await Clipboard.setStringAsync(forwardingAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    if (selected.size === 0) return;
    setDownloading(true);
    let xml: string;
    try {
      xml = await fetchGmailFilterXml([...selected]);
    } catch (e) {
      showError('Download failed', (e as Error).message ?? 'Please try again.');
      setDownloading(false);
      return;
    }
    setDownloading(false);

    // Ask the user to confirm before opening the folder picker.
    confirm({
      title: 'Choose where to save',
      message:
        'Your filter file is ready. Tap Continue and you\'ll be prompted to choose a folder on your device — pick Downloads or anywhere you can access from your desktop.',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await saveGmailFilterXml(xml);
          setDownloaded(true);
          showSuccess('Saved!', 'Import monimata-gmail-filter.xml in Gmail Settings → Filters.');
        } catch (e) {
          showError('Could not save file', (e as Error).message ?? 'Please try again.');
        }
      },
    });
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Gmail Filter Setup"
        subtitle="Auto-import bank alert emails"
        onBack={() => router.back()}
        paddingTop={insets.top + 16}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Prerequisite advisory ──────────────────────────────────────── */}
        <View style={[ss.advisoryCard, { backgroundColor: colors.infoSubtle, borderColor: colors.infoBorder ?? colors.border }]}>
          <View style={ss.advisoryHeader}>
            <Ionicons name="information-circle" size={18} color={colors.info} />
            <Text style={[type_.label, { color: colors.info }]}>Before you start</Text>
          </View>
          <Text style={[type_.bodyReg, { color: colors.textSecondary, lineHeight: 22 }]}>
            Gmail only forwards to{' '}
            <Text style={ff(600)}>approved addresses</Text>. Add your MoniMata address to
            Gmail&apos;s approved list first — otherwise forwarding will be silently blocked.
          </Text>
        </View>

        {/* ── Forwarding address ─────────────────────────────────────────── */}
        {forwardingAddress ? (
          <View style={[ss.addressCard, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
            <Text style={[ss.addressLabel, { color: colors.textMeta }]}>
              Step 1 — Your forwarding address
            </Text>
            <View style={ss.addressInner}>
              <Text style={[type_.body, { color: colors.brand, ...ff(600), flex: 1 }]} numberOfLines={1}>
                {forwardingAddress}
              </Text>
              <TouchableOpacity
                style={[
                  ss.copyPill,
                  copied
                    ? { backgroundColor: colors.successSubtle, borderColor: colors.successBorder }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={handleCopyAddress}
                accessibilityRole="button"
                accessibilityLabel="Copy forwarding address"
              >
                <Ionicons
                  name={copied ? 'checkmark-outline' : 'copy-outline'}
                  size={13}
                  color={copied ? colors.successText : colors.textMeta}
                />
                <Text style={[type_.caption, { color: copied ? colors.successText : colors.textMeta, ...ff(600) }]}>
                  {copied ? 'Copied' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[type_.caption, { color: colors.textMeta, lineHeight: 18, marginTop: spacing.xs }]}>
              Add this in Gmail Settings → Forwarding and POP/IMAP before importing the filter.
            </Text>
          </View>
        ) : null}

        {/* ── Bank selection ─────────────────────────────────────────────── */}
        <SectionHeader
          title="Select Banks"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: spacing.xxs }}
        />
        <Text style={[ss.sectionHint, { color: colors.textMeta }]}>
          Choose which banks to generate filters for. Only banks that support email alerts are shown.
        </Text>

        {/* Select / Clear all controls */}
        {!banksLoading && emailBanks.length > 0 && (
          <View style={ss.bulkRow}>
            <TouchableOpacity onPress={selectAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Select all banks">
              <Text style={[type_.bodyReg, { color: colors.brand }]}>Select all</Text>
            </TouchableOpacity>
            {selected.size > 0 && (
              <TouchableOpacity onPress={clearAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear selection">
                <Text style={[type_.bodyReg, { color: colors.textMeta }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={[ss.bankList, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          {banksLoading ? (
            <ActivityIndicator style={{ margin: spacing.xl }} color={colors.brand} />
          ) : emailBanks.length === 0 ? (
            <Text style={[type_.bodyReg, { color: colors.textMeta, textAlign: 'center', padding: spacing.xl }]}>
              No email-alert banks available.
            </Text>
          ) : (
            emailBanks.map((bank, i) => {
              const isChecked = selected.has(bank.slug);
              const isLast = i === emailBanks.length - 1;
              return (
                <TouchableOpacity
                  key={bank.slug}
                  style={[
                    ss.bankRow,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                    isChecked && { backgroundColor: colors.surface },
                  ]}
                  onPress={() => toggleBank(bank.slug)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={bank.name}
                >
                  <View style={[ss.bankIc, { backgroundColor: colors.surface }]}>
                    <Ionicons name="business-outline" size={17} color={colors.brand} />
                  </View>
                  <Text style={[type_.body, { color: colors.textPrimary, flex: 1 }]}>
                    {bank.name}
                  </Text>
                  <View
                    style={[
                      ss.checkbox,
                      isChecked
                        ? { backgroundColor: colors.brand, borderColor: colors.brand }
                        : { backgroundColor: 'transparent', borderColor: colors.border },
                    ]}
                  >
                    {isChecked && (
                      <Ionicons name="checkmark" size={13} color={colors.white} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── Download button ────────────────────────────────────────────── */}
        <View style={ss.downloadWrap}>
          <Button
            variant="green"
            onPress={handleDownload}
            disabled={selected.size === 0 || downloading || downloaded}
            loading={downloading}
            accessibilityLabel="Download Gmail filter file"
          >
            {downloaded ? '✓ Filter File Downloaded' : `Download Filter File${selected.size > 0 ? ` (${selected.size} bank${selected.size > 1 ? 's' : ''})` : ''}`}
          </Button>
        </View>

        {/* ── Next steps ─────────────────────────────────────────────────── */}
        <SectionHeader
          title="Complete the Setup"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: spacing.xxs }}
        />
        <View style={[ss.stepsCard, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <StepPill n={1} label="Add the forwarding address above to Gmail's approved list (Settings → Forwarding and POP/IMAP)." />
          <View style={ss.stepDivider} />
          <StepPill n={2} label="Open Gmail on a desktop browser and go to Settings (⚙) → See all settings." />
          <View style={ss.stepDivider} />
          <StepPill n={3} label='Go to the "Filters and Blocked Addresses" tab and click "Import filters".' />
          <View style={ss.stepDivider} />
          <StepPill n={4} label="Choose the .xml file you just downloaded and click Open, then import." />
          <View style={ss.stepDivider} />
          <StepPill n={5} label="That's it! New bank alert emails will now be forwarded to MoniMata automatically." />
          <View style={ss.stepDivider} />

          <TouchableOpacity
            style={ss.guideLink}
            onPress={() => Linking.openURL(GMAIL_SETUP_GUIDE_URL)}
            accessibilityRole="link"
            accessibilityLabel="Open full setup guide"
          >
            <Text style={[type_.bodyReg, { color: colors.brand }]}>
              Full setup guide with screenshots →
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: spacing.xxl + 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xl },

    advisoryCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.mdn,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.md,
      gap: spacing.sm,
    },
    advisoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    addressCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.md,
    },
    addressLabel: {
      ...type_.caption,
      ...ff(600),
      textTransform: 'uppercase' as const,
      letterSpacing: 0.4,
      marginBottom: spacing.xs,
    },
    addressInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    copyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: 100,
      borderWidth: 1,
    },
    guideLink: {
      paddingTop: spacing.xs,
    },

    sectionHint: {
      ...type_.caption,
      lineHeight: 19,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    bulkRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.xs,
    },

    bankList: {
      marginHorizontal: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    bankRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.smd,
      gap: spacing.sm,
    },
    bankIc: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },

    downloadWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.mdn,
      gap: spacing.sm,
    },

    stepsCard: {
      marginHorizontal: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xxs,
      paddingBottom: spacing.md,
      overflow: 'hidden',
    },
    stepDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.separator,
    },
  });
}
