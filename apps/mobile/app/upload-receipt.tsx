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
 * Upload Receipt screen — pick an image or PDF, upload to /uploads/receipt.
 *
 * Route: /upload-receipt
 *
 * The upload is async: the backend returns 202 immediately and processes
 * the file in a Celery task.  The new transaction appears via WebSocket
 * invalidation + push notification once processing completes.
 */
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import {
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { useToast } from '@/components/Toast';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import { uploadReceipt, type UploadReceiptFile } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

interface SelectedFile {
  uri: string;
  mimeType: string;
  name: string;
  kind: 'image' | 'pdf';
  /** byte size if known */
  size?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── PickerCard ───────────────────────────────────────────────────────────────

interface PickerCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}

function PickerCard({ icon, title, subtitle, onPress, disabled }: PickerCardProps) {
  const colors = useTheme();
  return (
    <TouchableOpacity
      style={[
        ss.pickerCard,
        { backgroundColor: colors.cardBg, borderColor: colors.border },
        disabled && { opacity: 0.45 },
      ]}
      onPress={() => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[ss.pickerIconWrap, { backgroundColor: colors.surface }]}>
        {icon}
      </View>
      <View style={ss.pickerText}>
        <Text style={[type_.body, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2 }]}>{subtitle}</Text>
      </View>
      <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9 18l6-6-6-6"
          stroke={colors.textTertiary}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function UploadReceiptScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();

  const [file, setFile] = useState<SelectedFile | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);

  // Animated progress shared value — smoother than driving ProgressBar directly
  // from onProgress (which fires on the JS thread via XHR).
  const animProgress = useSharedValue(0);

  // ── File pickers ──────────────────────────────────────────────────────────

  const pickImage = useCallback(async () => {
    if (uploadState === 'uploading') return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      toastError('Permission denied', 'Allow photo library access in Settings to upload receipts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85,
    });

    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    setFile({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      name: asset.fileName ?? `receipt_${Date.now()}.jpg`,
      kind: 'image',
      size: asset.fileSize,
    });
    setUploadState('idle');
    setProgress(0);
    animProgress.value = 0;
  }, [uploadState, toastError, animProgress]);

  const pickPdf = useCallback(async () => {
    if (uploadState === 'uploading') return;

    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets.length) return;

    const asset = result.assets[0];
    setFile({
      uri: asset.uri,
      mimeType: 'application/pdf',
      name: asset.name,
      kind: 'pdf',
      size: asset.size ?? undefined,
    });
    setUploadState('idle');
    setProgress(0);
    animProgress.value = 0;
  }, [uploadState, animProgress]);

  // ── Upload ────────────────────────────────────────────────────────────────

  const doUpload = useCallback(async (fileToUpload: SelectedFile) => {
    setUploadState('uploading');
    setProgress(0);
    animProgress.value = 0;

    // Animate bar to ~0.85 at a steady pace as a loading indicator.
    // XHR onProgress events drive real progress for the first 90%.
    // We cap at 0.9 until the server responds then snap to 1.
    animProgress.value = withTiming(0.85, { duration: 4000 });

    const apiFile: UploadReceiptFile = {
      uri: fileToUpload.uri,
      mimeType: fileToUpload.mimeType,
      name: fileToUpload.name,
    };

    try {
      await uploadReceipt(apiFile, (fraction) => {
        // Real XHR upload progress — cap at 0.9 (last 10% is server processing).
        const capped = Math.min(fraction * 0.9, 0.9);
        animProgress.value = withSpring(capped, { damping: 20, stiffness: 200 });
        setProgress(capped);
      });

      // Upload acknowledged — snap bar to complete.
      animProgress.value = withSpring(1, { damping: 18, stiffness: 250 });
      setProgress(1);
      setUploadState('done');

      toastSuccess(
        'Receipt uploaded!',
        "We'll notify you once your transaction is ready.",
      );

      // Brief pause so the user sees 100%, then navigate to transactions.
      setTimeout(() => {
        router.replace('/(tabs)/transactions' as never);
      }, 800);
    } catch (err) {
      animProgress.value = withTiming(0, { duration: 300 });
      setProgress(0);
      setUploadState('error');
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toastError('Upload failed', msg);
    }
  }, [animProgress, router, toastSuccess, toastError]);

  const handleUpload = useCallback(() => {
    if (!file || uploadState === 'uploading' || uploadState === 'done') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    doUpload(file);
  }, [file, uploadState, doUpload]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const isUploading = uploadState === 'uploading';
  const isDone = uploadState === 'done';
  const isError = uploadState === 'error';

  const uploadBtnLabel = isUploading
    ? 'Uploading…'
    : isDone
      ? 'Uploaded ✓'
      : isError
        ? 'Retry Upload'
        : 'Upload Receipt';

  const uploadBtnBg = isDone ? colors.successSubtle : isUploading ? colors.surface : colors.brand;
  const uploadBtnTextColor = isDone ? colors.successText : isUploading ? colors.textMeta : colors.white;

  useStatusBarStyle('light');

  return (
    <View style={[ss.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Upload Receipt"
        onBack={() => router.back()}
        paddingTop={insets.top + 10}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={[ss.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Intro blurb ── */}
        <Text style={[type_.small, { color: colors.textMeta, marginBottom: spacing.lg }]}>
          Snap or export a bank transaction receipt. MoniMata will identify the
          bank and create your transaction automatically.
        </Text>

        {/* ── File pickers ── */}
        <PickerCard
          onPress={pickImage}
          disabled={isUploading || isDone}
          title="Select Image"
          subtitle="JPG, PNG, or WebP · max 5 MB"
          icon={
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Rect
                x={3}
                y={3}
                width={18}
                height={18}
                rx={3}
                stroke={colors.brand}
                strokeWidth={1.8}
              />
              <Path
                d="M3 15l5-5 4 4 3-3 6 6"
                stroke={colors.brand}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M8.5 9.5a1 1 0 110-2 1 1 0 010 2z"
                fill={colors.brand}
              />
            </Svg>
          }
        />

        <View style={{ height: spacing.md }} />

        <PickerCard
          onPress={pickPdf}
          disabled={isUploading || isDone}
          title="Select PDF"
          subtitle="Bank receipt PDF · max 5 MB"
          icon={
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                stroke={colors.brand}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M14 2v6h6"
                stroke={colors.brand}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M9 13h6M9 17h4"
                stroke={colors.brand}
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            </Svg>
          }
        />

        {/* ── File preview ── */}
        {file && (
          <View
            style={[
              ss.previewCard,
              { backgroundColor: colors.cardBg, borderColor: isError ? colors.errorBorder : colors.border },
            ]}
          >
            {file.kind === 'image' ? (
              <Image
                source={{ uri: file.uri }}
                style={ss.previewImage}
                contentFit="cover"
                accessibilityLabel="Selected receipt image"
              />
            ) : (
              <View style={[ss.pdfPreview, { backgroundColor: colors.surface }]}>
                <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                    stroke={colors.brand}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                  <Path
                    d="M14 2v6h6"
                    stroke={colors.brand}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            )}

            <View style={ss.previewMeta}>
              <Text
                style={[type_.small, { color: colors.textPrimary }]}
                numberOfLines={2}
              >
                {file.name}
              </Text>
              {file.size ? (
                <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2 }]}>
                  {formatBytes(file.size)}
                </Text>
              ) : null}
              {!isUploading && !isDone && (
                <TouchableOpacity
                  onPress={() => {
                    setFile(null);
                    setUploadState('idle');
                    setProgress(0);
                    animProgress.value = 0;
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove file"
                  style={{ marginTop: spacing.sm }}
                >
                  <Text style={[type_.caption, { color: colors.error }]}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Progress bar ── */}
        {(isUploading || isDone || isError) && (
          <View style={ss.progressWrap}>
            <ProgressBar
              progress={progress}
              state={isDone ? 'ok' : isError ? 'over' : 'brand'}
              size="sm"
              animate
            />
            <Text
              style={[
                type_.caption,
                {
                  color: isDone
                    ? colors.successText
                    : isError
                      ? colors.error
                      : colors.textMeta,
                  marginTop: spacing.sm,
                  textAlign: 'center',
                },
              ]}
            >
              {isDone
                ? 'Upload complete — transaction processing…'
                : isError
                  ? 'Upload failed. Tap "Retry Upload" to try again.'
                  : `Uploading… ${Math.round(progress * 100)}%`}
            </Text>
          </View>
        )}

        {/* ── Upload button ── */}
        {file && (
          <TouchableOpacity
            style={[
              ss.uploadBtn,
              { backgroundColor: uploadBtnBg },
              (isUploading || isDone) && { opacity: 0.75 },
            ]}
            onPress={handleUpload}
            disabled={isUploading || isDone}
            accessibilityRole="button"
            accessibilityLabel={uploadBtnLabel}
            activeOpacity={0.8}
          >
            <Text style={[ss.uploadBtnText, { color: uploadBtnTextColor }]}>
              {uploadBtnLabel}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Tip ── */}
        <View style={[ss.tip, { backgroundColor: colors.infoSubtle, borderColor: colors.infoBorder }]}>
          <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none" style={{ marginTop: 1 }}>
            <Path
              d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
              stroke={colors.info}
              strokeWidth={1.8}
            />
            <Path
              d="M12 8v4M12 16h.01"
              stroke={colors.info}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
          <Text style={[type_.caption, { color: colors.info, flex: 1 }]}>
            After uploading, the transaction is processed in the background. You&apos;ll
            get a push notification when it&apos;s ready — no need to stay on this screen.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: layout.iconBtnSize,
    height: layout.iconBtnSize,
    borderRadius: radius.smd,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.xl,
  },

  // Picker cards
  pickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.mdn,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  pickerIconWrap: {
    width: layout.rowMinHeight,
    height: layout.rowMinHeight,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pickerText: { flex: 1 },

  // Preview card
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewImage: {
    width: layout.avatarLg + spacing.lg,
    height: layout.avatarLg + spacing.lg,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  pdfPreview: {
    width: layout.avatarLg + spacing.lg,
    height: layout.avatarLg + spacing.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  previewMeta: { flex: 1 },

  // Progress
  progressWrap: {
    marginTop: spacing.xl,
  },

  // Upload button
  uploadBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.mdn,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: {
    ...type_.btnLg,
  },

  // Tip box
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
