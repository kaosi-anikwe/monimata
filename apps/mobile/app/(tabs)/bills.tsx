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
 * Bills tab — multi-step state machine for Interswitch bill payments.
 *
 * Flow:
 *   categories → billers → payment_items → customer_form → confirm → receipt
 *
 * The screen is fully self-contained (no sub-routes). Step state lives here.
 * History is accessible via a toggle on the categories step.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { useAccounts } from '@/hooks/useAccounts';
import type { BankAccount } from '@/types/account';
import type { CategoryItem } from '@/types/category';
import { useCategoryGroups } from '@/hooks/useCategories';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { formatNaira, nairaStringToKobo, koboToNaira } from '@/utils/money';
import {
  useBillCategories,
  useBillers,
  useBillPaymentItems,
  useValidateCustomer,
  usePayBill,
  useBillHistory,
  usePaymentStatus,
} from '@/hooks/useBills';
import type {
  BillerCategory,
  Biller,
  PaymentItem,
  CustomerValidationResponse,
  BillPayResponse,
} from '@/types/bills';

// ─── Step type ────────────────────────────────────────────────────────────────

type BillStep =
  | 'categories'
  | 'billers'
  | 'payment_items'
  | 'customer_form'
  | 'confirm'
  | 'receipt';

// ─── Back-step map ────────────────────────────────────────────────────────────

const PREV_STEP: Partial<Record<BillStep, BillStep>> = {
  billers: 'categories',
  payment_items: 'billers',
  customer_form: 'payment_items',
  confirm: 'customer_form',
};

// ─── Step header ──────────────────────────────────────────────────────────────

function StepHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.header}>
      {onBack ? (
        <TouchableOpacity style={s.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
      ) : (
        <View style={s.backBtn} />
      )}
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.headerRight}>{right ?? null}</View>
    </View>
  );
}

// ─── Category grid item ───────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  airtime: 'phone-portrait-outline',
  data: 'wifi-outline',
  electricity: 'flash-outline',
  water: 'water-outline',
  cable: 'tv-outline',
  insurance: 'shield-checkmark-outline',
  toll: 'car-outline',
  school: 'school-outline',
};

function categoryIcon(name: string): React.ComponentProps<typeof Ionicons>['name'] {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return 'receipt-outline';
}

function CategoryCard({
  item,
  onPress,
}: {
  item: BillerCategory;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.categoryCard} onPress={onPress} activeOpacity={0.75}>
      <View style={s.categoryIcon}>
        <Ionicons name={categoryIcon(item.name)} size={26} color="#0F7B3F" />
      </View>
      <Text style={s.categoryName} numberOfLines={2}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Biller list item ─────────────────────────────────────────────────────────

function BillerRow({ item, onPress }: { item: Biller; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.billerRow} onPress={onPress} activeOpacity={0.75}>
      <View style={s.billerIcon}>
        <Ionicons name="business-outline" size={20} color="#0F7B3F" />
      </View>
      <View style={s.billerInfo}>
        <Text style={s.billerName}>{item.name}</Text>
        {item.short_name ? (
          <Text style={s.billerSub}>{item.short_name}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

// ─── Payment item row ─────────────────────────────────────────────────────────

function PaymentItemRow({
  item,
  onPress,
}: {
  item: PaymentItem;
  onPress: () => void;
}) {
  const amountLabel = item.is_amount_fixed && item.fixed_amount
    ? formatNaira(item.fixed_amount)
    : 'Variable amount';

  return (
    <TouchableOpacity style={s.billerRow} onPress={onPress} activeOpacity={0.75}>
      <View style={s.billerIcon}>
        <Ionicons name="pricetag-outline" size={20} color="#0F7B3F" />
      </View>
      <View style={s.billerInfo}>
        <Text style={s.billerName}>{item.name}</Text>
        <Text style={s.billerSub}>{amountLabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

// ─── Account chip row ─────────────────────────────────────────────────────────

function AccountPicker({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: BankAccount[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.accountScroll}
      contentContainerStyle={s.accountScrollContent}
    >
      {accounts.map((a) => {
        const active = a.id === selectedId;
        return (
          <TouchableOpacity
            key={a.id}
            style={[s.accountChip, active && s.accountChipActive]}
            onPress={() => onSelect(a.id)}
            activeOpacity={0.8}
          >
            <Text style={[s.accountChipInst, active && s.accountChipTextActive]}>
              {a.institution}
            </Text>
            <Text style={[s.accountChipBal, active && s.accountChipTextActive]}>
              {formatNaira(a.balance)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Budget category picker ──────────────────────────────────────────────────

interface CategoryGroup {
  id: string;
  name: string;
  categories: CategoryItem[];
}

function CategoryPickerField({
  groups,
  selectedId,
  onSelect,
}: {
  groups: CategoryGroup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedName = selectedId
    ? groups.flatMap((g) => g.categories).find((c) => c.id === selectedId)?.name
    : null;

  return (
    <View>
      <TouchableOpacity
        style={s.catPickerTrigger}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.75}
      >
        <Ionicons name="folder-outline" size={16} color="#0F7B3F" />
        <Text style={s.catPickerTriggerText}>
          {selectedName ?? 'None — skip budget tracking'}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#6B7280"
        />
      </TouchableOpacity>

      {open && (
        <View style={s.catPickerPanel}>
          {/* None option */}
          <TouchableOpacity
            style={[s.catChip, !selectedId && s.catChipActive]}
            onPress={() => { onSelect(null); setOpen(false); }}
            activeOpacity={0.75}
          >
            <Text style={[s.catChipText, !selectedId && s.catChipTextActive]}>
              None
            </Text>
          </TouchableOpacity>

          {groups
            .filter((g) => g.categories.length > 0)
            .map((g) => (
              <View key={g.id}>
                <Text style={s.catGroupLabel}>{g.name}</Text>
                <View style={s.catChipRow}>
                  {g.categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.catChip, selectedId === c.id && s.catChipActive]}
                      onPress={() => { onSelect(c.id); setOpen(false); }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          s.catChipText,
                          selectedId === c.id && s.catChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}

// ─── History list ─────────────────────────────────────────────────────────────

function HistoryView() {
  const { data: history = [], isLoading } = useBillHistory();

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#0F7B3F" />;
  }

  if (history.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <Ionicons name="receipt-outline" size={52} color="#D1FAE5" />
        <Text style={s.emptyTitle}>No bill payments yet</Text>
        <Text style={s.emptySub}>Your Interswitch payments will appear here.</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={history}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      ItemSeparatorComponent={() => <View style={s.separator} />}
      renderItem={({ item }) => (
        <View style={s.historyRow}>
          <View style={s.historyLeft}>
            <Text style={s.historyNarration} numberOfLines={1}>
              {item.narration}
            </Text>
            <Text style={s.historyRef} numberOfLines={1}>
              {item.reference}
            </Text>
            <Text style={s.historyDate}>
              {new Date(item.date).toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </View>
          <Text style={s.historyAmount}>{formatNaira(Math.abs(item.amount))}</Text>
        </View>
      )}
    />
  );
}

// ─── Receipt step (own component so polling hook is only mounted when needed) ─

function ReceiptStep({
  payResult,
  onDone,
}: {
  payResult: BillPayResponse;
  onDone: () => void;
}) {
  const isPending = payResult.status === 'pending';
  // Poll only when the initial status was pending — stops automatically once
  // the query returns a non-pending status (refetchInterval returns false).
  const { data: liveStatus } = usePaymentStatus(
    isPending ? payResult.reference : null,
  );

  const resolvedStatus = liveStatus?.status ?? payResult.status;
  const isStillPending = resolvedStatus === 'pending';

  const iconName = isStillPending
    ? 'time-outline'
    : resolvedStatus === 'success'
      ? 'checkmark-circle'
      : 'close-circle';
  const iconColor = isStillPending
    ? '#F59E0B'
    : resolvedStatus === 'success'
      ? '#0F7B3F'
      : '#DC2626';
  const title = isStillPending
    ? 'Payment Processing…'
    : resolvedStatus === 'success'
      ? 'Payment Successful'
      : 'Payment Failed';

  return (
    <SafeAreaView style={s.safe}>
      <StepHeader title={title} />
      <ScrollView contentContainerStyle={s.formContent}>
        <View style={s.receiptCard}>
          <View style={s.receiptIconWrap}>
            {isStillPending ? (
              <ActivityIndicator size={56} color="#F59E0B" />
            ) : (
              <Ionicons name={iconName} size={56} color={iconColor} />
            )}
          </View>
          <Text style={s.receiptAmount}>
            {formatNaira(Math.abs(payResult.amount))}
          </Text>
          <Text style={s.receiptNarration}>{payResult.narration}</Text>

          {isStillPending && (
            <Text style={s.pendingNote}>
              Your payment is being processed. This page refreshes automatically.
            </Text>
          )}

          <View style={s.confirmDivider} />

          <SummaryRow label="Reference" value={payResult.reference} mono />
          <SummaryRow label="Status" value={resolvedStatus.toUpperCase()} />
          <SummaryRow
            label="Date"
            value={new Date(payResult.date).toLocaleString('en-NG', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          />
        </View>

        <TouchableOpacity
          style={s.primaryBtn}
          onPress={onDone}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function BillsContent() {
  // ── Step state ──
  const [step, setStep] = useState<BillStep>('categories');
  const [showHistory, setShowHistory] = useState(false);

  // ── Selection state ──
  const [selectedCategory, setSelectedCategory] = useState<BillerCategory | null>(null);
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedItem, setSelectedItem] = useState<PaymentItem | null>(null);

  // ── Customer form state ──
  const [customerId, setCustomerId] = useState('');
  const [amountNaira, setAmountNaira] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedBudgetCategoryId, setSelectedBudgetCategoryId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<CustomerValidationResponse | null>(null);

  // ── Receipt state ──
  const [payResult, setPayResult] = useState<BillPayResponse | null>(null);

  // ── Data hooks ──
  const { data: categories = [], isLoading: loadingCategories } = useBillCategories();
  const { data: billers = [], isLoading: loadingBillers } = useBillers(
    selectedCategory?.id ?? null,
  );
  const { data: paymentItems = [], isLoading: loadingItems } = useBillPaymentItems(
    selectedBiller?.id ?? null,
  );
  const { data: accounts = [], isLoading: loadingAccounts } = useAccounts();
  const { data: categoryGroups = [] } = useCategoryGroups();

  const validateMutation = useValidateCustomer();
  const payMutation = usePayBill();
  const { error } = useToast();

  // Auto-select first account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Auto-advance from payment_items when only one option exists
  useEffect(() => {
    if (
      step === 'payment_items' &&
      !loadingItems &&
      paymentItems.length === 1
    ) {
      selectPaymentItem(paymentItems[0]);
    }
  }, [step, loadingItems, paymentItems]);

  // ── Navigation helpers ──
  const goBack = useCallback(() => {
    const prev = PREV_STEP[step];
    if (prev) {
      setStep(prev);
      // Clear downstream state when going back
      if (prev === 'categories') {
        setSelectedBiller(null);
        setSelectedItem(null);
        resetForm();
      } else if (prev === 'billers') {
        setSelectedItem(null);
        resetForm();
      } else if (prev === 'payment_items') {
        resetForm();
      } else if (prev === 'customer_form') {
        setValidationResult(null);
      }
    }
  }, [step]);

  function resetAll() {
    setStep('categories');
    setShowHistory(false);
    setSelectedCategory(null);
    setSelectedBiller(null);
    setSelectedItem(null);
    resetForm();
    setPayResult(null);
  }

  function resetForm() {
    setCustomerId('');
    setAmountNaira('');
    setSelectedBudgetCategoryId(null);
    setValidationResult(null);
  }

  // ── Selection handlers ──
  function selectCategory(cat: BillerCategory) {
    setSelectedCategory(cat);
    setStep('billers');
  }

  function selectBiller(biller: Biller) {
    setSelectedBiller(biller);
    setStep('payment_items');
  }

  function selectPaymentItem(item: PaymentItem) {
    setSelectedItem(item);
    // Pre-fill amount if fixed
    if (item.is_amount_fixed && item.fixed_amount) {
      setAmountNaira(String(koboToNaira(item.fixed_amount)));
    } else {
      setAmountNaira('');
    }
    setStep('customer_form');
  }

  // ── Validation ──
  function handleValidate() {
    if (!customerId.trim()) {
      error('Missing Info', 'Please enter a customer/account ID.');
      return;
    }
    if (!selectedItem) return;

    validateMutation.mutate(
      { payment_code: selectedItem.payment_code, customer_id: customerId.trim() },
      {
        onSuccess: (result) => {
          if (result.response_code !== '00') {
            error(
              'Validation Failed',
              result.response_description || 'Could not validate customer. Check your details.',
            );
            return;
          }
          // If biller fixes the amount, override what user may have entered
          if (result.is_amount_fixed && result.fixed_amount) {
            setAmountNaira(String(koboToNaira(result.fixed_amount)));
          }
          setValidationResult(result);
          setStep('confirm');
        },
        onError: () => {
          error('Validation Error', 'Could not validate at this time. Please try again.');
        },
      },
    );
  }

  // ── Payment ──
  function handlePay() {
    if (!selectedItem || !validationResult || !selectedAccountId) return;

    const amountKobo =
      validationResult.is_amount_fixed && validationResult.fixed_amount
        ? validationResult.fixed_amount
        : nairaStringToKobo(amountNaira);

    if (amountKobo < 100) {
      error('Invalid Amount', 'Amount must be at least ₦1.00.');
      return;
    }

    payMutation.mutate(
      {
        payment_code: selectedItem.payment_code,
        customer_id: customerId.trim(),
        amount: amountKobo,
        account_id: selectedAccountId,
        biller_name: selectedBiller?.name ?? undefined,
        ...(selectedBudgetCategoryId ? { category_id: selectedBudgetCategoryId } : {}),
      },
      {
        onSuccess: (result) => {
          setPayResult(result);
          setStep('receipt');
        },
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            'Payment failed. Please try again.';
          error('Payment Failed', message);
        },
      },
    );
  }

  // ── Computed display values ──
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  function buildDisplayAmount(): string {
    if (!selectedItem) return '—';
    if (validationResult?.is_amount_fixed && validationResult.fixed_amount) {
      return formatNaira(validationResult.fixed_amount);
    }
    if (selectedItem.is_amount_fixed && selectedItem.fixed_amount) {
      return formatNaira(selectedItem.fixed_amount);
    }
    const kobo = nairaStringToKobo(amountNaira);
    return kobo > 0 ? formatNaira(kobo) : '—';
  }

  // ── Step renders ──
  // --- CATEGORIES ---
  if (step === 'categories') {
    return (
      <SafeAreaView style={s.safe}>
        <StepHeader
          title="Pay Bills"
          right={
            <TouchableOpacity
              onPress={() => setShowHistory((v) => !v)}
              activeOpacity={0.7}
              style={s.historyBtn}
            >
              <Ionicons
                name={showHistory ? 'grid-outline' : 'time-outline'}
                size={20}
                color="#0F7B3F"
              />
            </TouchableOpacity>
          }
        />

        {showHistory ? (
          <HistoryView />
        ) : loadingCategories ? (
          <ActivityIndicator style={{ flex: 1 }} color="#0F7B3F" />
        ) : (
          <FlatList
            key="category-grid"
            data={categories}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={s.categoryRow}
            contentContainerStyle={s.categoryGrid}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Text style={s.emptyTitle}>No categories found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <CategoryCard item={item} onPress={() => selectCategory(item)} />
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // --- BILLERS ---
  if (step === 'billers') {
    return (
      <SafeAreaView style={s.safe}>
        <StepHeader
          title={selectedCategory?.name ?? 'Select Biller'}
          onBack={goBack}
        />
        {loadingBillers ? (
          <ActivityIndicator style={{ flex: 1 }} color="#0F7B3F" />
        ) : (
          <FlatList
            key="billers-list"
            data={billers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Text style={s.emptyTitle}>No billers in this category</Text>
              </View>
            }
            renderItem={({ item }) => (
              <BillerRow item={item} onPress={() => selectBiller(item)} />
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // --- PAYMENT ITEMS ---
  if (step === 'payment_items') {
    return (
      <SafeAreaView style={s.safe}>
        <StepHeader title={selectedBiller?.name ?? 'Select Plan'} onBack={goBack} />
        {loadingItems ? (
          <ActivityIndicator style={{ flex: 1 }} color="#0F7B3F" />
        ) : (
          <FlatList
            key="payment-items-list"
            data={paymentItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.listContent}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            ListEmptyComponent={
              <View style={s.emptyContainer}>
                <Text style={s.emptyTitle}>No payment options found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <PaymentItemRow item={item} onPress={() => selectPaymentItem(item)} />
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // --- CUSTOMER FORM ---
  if (step === 'customer_form') {
    const isFixed = selectedItem?.is_amount_fixed ?? false;
    const isValidating = validateMutation.isPending;

    return (
      <SafeAreaView style={s.safe}>
        <StepHeader title="Customer Details" onBack={goBack} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={s.formContent}>
            {/* Biller summary chip */}
            <View style={s.contextChip}>
              <Ionicons name="business-outline" size={14} color="#0F7B3F" />
              <Text style={s.contextChipText}>
                {selectedBiller?.name} · {selectedItem?.name}
              </Text>
            </View>

            <Text style={s.fieldLabel}>Customer / Account ID</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 07012345678 or meter number"
              placeholderTextColor="#9CA3AF"
              value={customerId}
              onChangeText={setCustomerId}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />

            {!isFixed && (
              <>
                <Text style={s.fieldLabel}>Amount (₦)</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 2000"
                  placeholderTextColor="#9CA3AF"
                  value={amountNaira}
                  onChangeText={setAmountNaira}
                  keyboardType="decimal-pad"
                />
              </>
            )}

            {isFixed && selectedItem?.fixed_amount ? (
              <View style={s.fixedAmountBadge}>
                <Text style={s.fixedAmountLabel}>Fixed amount</Text>
                <Text style={s.fixedAmountValue}>
                  {formatNaira(selectedItem.fixed_amount)}
                </Text>
              </View>
            ) : null}

            <Text style={s.fieldLabel}>Budget category (optional)</Text>
            <CategoryPickerField
              groups={categoryGroups}
              selectedId={selectedBudgetCategoryId}
              onSelect={setSelectedBudgetCategoryId}
            />

            <Text style={s.fieldLabel}>Pay from account</Text>
            {loadingAccounts ? (
              <ActivityIndicator color="#0F7B3F" />
            ) : accounts.length === 0 ? (
              <View style={s.warningBox}>
                <Ionicons name="warning-outline" size={16} color="#92400E" />
                <Text style={s.warningText}>
                  No linked accounts. Please link a bank account first.
                </Text>
              </View>
            ) : (
              <AccountPicker
                accounts={accounts}
                selectedId={selectedAccountId}
                onSelect={setSelectedAccountId}
              />
            )}

            <TouchableOpacity
              style={[
                s.primaryBtn,
                (isValidating || !customerId.trim() || accounts.length === 0) &&
                s.primaryBtnDisabled,
              ]}
              onPress={handleValidate}
              disabled={isValidating || !customerId.trim() || accounts.length === 0}
              activeOpacity={0.85}
            >
              {isValidating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Validate & Continue</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- CONFIRM ---
  if (step === 'confirm') {
    const isPaying = payMutation.isPending;

    return (
      <SafeAreaView style={s.safe}>
        <StepHeader title="Confirm Payment" onBack={goBack} />
        <ScrollView contentContainerStyle={s.formContent}>
          <View style={s.confirmCard}>
            <SummaryRow label="Biller" value={selectedBiller?.name ?? '—'} />
            <SummaryRow label="Plan" value={selectedItem?.name ?? '—'} />
            <SummaryRow
              label="Customer"
              value={validationResult?.customer_name ?? customerId}
            />
            <SummaryRow label="Customer ID" value={customerId} />
            <SummaryRow
              label="Budget category"
              value={
                selectedBudgetCategoryId
                  ? (categoryGroups
                    .flatMap((g) => g.categories)
                    .find((c) => c.id === selectedBudgetCategoryId)
                    ?.name ?? '—')
                  : 'None'
              }
            />
            <SummaryRow
              label="Account"
              value={
                selectedAccount
                  ? `${selectedAccount.institution} (${formatNaira(selectedAccount.balance)})`
                  : '—'
              }
            />
            <View style={s.confirmDivider} />
            <SummaryRow
              label="Amount"
              value={buildDisplayAmount()}
              bold
            />
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, isPaying && s.primaryBtnDisabled]}
            onPress={handlePay}
            disabled={isPaying}
            activeOpacity={0.85}
          >
            {isPaying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>Pay Now</Text>
            )}
          </TouchableOpacity>

          <Text style={s.disclaimer}>
            By tapping Pay Now, you authorise MoniMata to process this payment
            via Interswitch. This action cannot be undone.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- RECEIPT ---
  if (step === 'receipt' && payResult) {
    return <ReceiptStep payResult={payResult} onDone={resetAll} />;
  }

  return null;
}

// ─── Summary row helper ───────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  bold,
  mono,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text
        style={[s.summaryValue, bold && s.summaryValueBold, mono && s.summaryValueMono]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export default function BillsScreen() {
  return (
    <ErrorBoundary>
      <BillsContent />
    </ErrorBoundary>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginHorizontal: 4,
  },
  headerRight: { width: 36, alignItems: 'flex-end' },
  historyBtn: { padding: 6 },

  // Category grid
  categoryGrid: { padding: 16, paddingBottom: 40 },
  categoryRow: { justifyContent: 'space-between', marginBottom: 12 },
  categoryCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },

  // Biller list
  listContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  billerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  billerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  billerInfo: { flex: 1 },
  billerName: { fontSize: 15, fontWeight: '500', color: '#111827' },
  billerSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  separator: { height: 1, backgroundColor: '#F3F4F6' },

  // Form
  formContent: { padding: 20, paddingBottom: 48 },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 20,
    gap: 6,
  },
  contextChipText: { fontSize: 13, color: '#065F46', fontWeight: '500' },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  fixedAmountBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  fixedAmountLabel: { fontSize: 13, color: '#6B7280' },
  fixedAmountValue: { fontSize: 16, fontWeight: '700', color: '#0F7B3F' },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  warningText: { flex: 1, fontSize: 13, color: '#92400E' },

  // Budget category picker
  catPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  catPickerTriggerText: { flex: 1, fontSize: 14, color: '#374151' },
  catPickerPanel: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  catGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  catChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  catChipActive: { backgroundColor: '#0F7B3F', borderColor: '#0F7B3F' },
  catChipText: { fontSize: 13, color: '#374151' },
  catChipTextActive: { color: '#fff', fontWeight: '600' },

  // Account picker
  accountScroll: { marginTop: 4 },
  accountScrollContent: { gap: 10, paddingRight: 4 },
  accountChip: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 130,
  },
  accountChipActive: { borderColor: '#0F7B3F', backgroundColor: '#F0FDF4' },
  accountChipInst: { fontSize: 13, fontWeight: '600', color: '#374151' },
  accountChipBal: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  accountChipTextActive: { color: '#0F7B3F' },

  // Confirm card
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  summaryLabel: { fontSize: 13, color: '#6B7280', flex: 1 },
  summaryValue: { fontSize: 14, color: '#111827', flex: 2, textAlign: 'right' },
  summaryValueBold: { fontWeight: '700', fontSize: 16, color: '#0F7B3F' },
  summaryValueMono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },

  // Receipt
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  receiptIconWrap: { marginBottom: 12 },
  receiptAmount: { fontSize: 32, fontWeight: '800', color: '#0F7B3F', marginBottom: 6 },
  receiptNarration: { fontSize: 14, color: '#6B7280', marginBottom: 16, textAlign: 'center' },
  pendingNote: {
    fontSize: 13,
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: 'center',
    marginBottom: 4,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: '#0F7B3F',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disclaimer: {
    marginTop: 14,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Empty / history
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySub: { fontSize: 14, color: '#9CA3AF', marginTop: 6, textAlign: 'center' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  historyLeft: { flex: 1, marginRight: 12 },
  historyNarration: { fontSize: 14, fontWeight: '500', color: '#111827' },
  historyRef: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  historyDate: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  historyAmount: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
});
