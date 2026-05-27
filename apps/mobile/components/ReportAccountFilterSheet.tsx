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
 * ReportAccountFilterSheet
 *
 * Bottom sheet that lets the user toggle which bank accounts are included
 * in report data.  Excluded account IDs are persisted in Redux + SecureStore.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccounts } from '@/hooks/useAccounts';
import { useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleReportAccountExclusion } from '@/store/preferencesSlice';

export interface ReportAccountFilterSheetProps {
    visible: boolean;
    onClose: () => void;
}

export function ReportAccountFilterSheet({ visible, onClose }: ReportAccountFilterSheetProps) {
    const colors = useTheme();
    const insets = useSafeAreaInsets();
    const dispatch = useAppDispatch();
    const { data: accounts } = useAccounts();
    const excluded = useAppSelector((st) => st.preferences.reportExcludedAccountIds);

    if (!visible) return null;

    const list = (accounts ?? []).filter((a) => !a.deleted_at);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={[s.backdrop, { backgroundColor: colors.overlayNeutral }]}
                activeOpacity={1}
                onPress={onClose}
            />

            <View style={s.outer}>
                <View style={[s.sheet, { backgroundColor: colors.cardBg, paddingBottom: insets.bottom + spacing.lg }]}>
                    {/* Drag handle */}
                    <View style={[s.handle, { backgroundColor: colors.borderStrong }]} />

                    <Text style={[type_.h3, { color: colors.textPrimary, marginHorizontal: spacing.lg }]}>
                        Filter Accounts
                    </Text>
                    <Text style={[type_.small, { color: colors.textMeta, marginHorizontal: spacing.lg, marginTop: spacing.xxs }]}>
                        Uncheck accounts to exclude them from reports.
                    </Text>

                    <ScrollView style={s.list} contentContainerStyle={s.listContent}>
                        {list.map((acct) => {
                            const isExcluded = excluded.includes(acct.id);
                            return (
                                <TouchableOpacity
                                    key={acct.id}
                                    style={[s.row, { borderBottomColor: colors.border }]}
                                    onPress={() => dispatch(toggleReportAccountExclusion(acct.id))}
                                    activeOpacity={0.7}
                                >
                                    <View style={s.rowText}>
                                        <Text
                                            style={[type_.body, { color: isExcluded ? colors.textTertiary : colors.textPrimary }]}
                                            numberOfLines={1}
                                        >
                                            {acct.alias || acct.account_name}
                                        </Text>
                                        <Text style={[type_.caption, { color: colors.textMeta }]}>
                                            {acct.institution}
                                        </Text>
                                    </View>

                                    <Ionicons
                                        name={isExcluded ? 'square-outline' : 'checkbox'}
                                        size={24}
                                        color={isExcluded ? colors.textTertiary : colors.brand}
                                    />
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <TouchableOpacity
                        style={[s.doneBtn, { backgroundColor: colors.brand }]}
                        onPress={onClose}
                    >
                        <Text style={[type_.body, { color: colors.white, ...ff(600) }]}>Done</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    outer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        maxHeight: '70%',
    },
    handle: {
        width: layout.sheetHandle.width,
        height: layout.sheetHandle.height,
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: spacing.md,
        marginBottom: spacing.md,
    },
    list: {
        marginTop: spacing.md,
    },
    listContent: {
        paddingHorizontal: spacing.lg,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowText: {
        flex: 1,
        marginRight: spacing.md,
    },
    doneBtn: {
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        height: layout.rowMinHeight,
        borderRadius: radius.smd,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
