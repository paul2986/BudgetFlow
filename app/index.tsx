import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateHouseholdExpenses,
  calculatePersonalExpenses,
} from '../utils/calculations';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Text, View, ScrollView, AppState, KeyboardAvoidingView, Platform, AppStateStatus, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';
import { useBudgetData } from '../hooks/useBudgetData';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import { useBudgetLock } from '../hooks/useBudgetLock';
import Icon from '../components/Icon';
import Button from '../components/Button';
import StandardHeader from '../components/StandardHeader';
import OverviewSection from '../components/OverviewSection';
import IndividualBreakdownsSection from '../components/IndividualBreakdownsSection';
import ExpiringSection from '../components/ExpiringSection';
import ExpenseBreakdownSection from '../components/ExpenseBreakdownSection';
import DebtRepaymentSection from '../components/DebtRepaymentSection';
import { Card, Input, ListGroup, ListRow, Skeleton } from '../components/ui';
import { type, space, radius } from '../styles/tokens';

/**
 * Overview (UI_AUDIT Phase 4). One shell — header + scroll column — with one
 * body per state, in priority order:
 *   loading → no budget yet → budget locked → setup checklist → dashboard.
 * Replaces six separately styled return trees.
 */

/**
 * Dashboard section header (DESIGN.md §2.7): h2 title + one-line caption.
 * Replaces the legacy info-modal ⓘ buttons — the caption explains the section.
 */
function DashboardSection({
  title,
  caption,
  children,
  style,
}: {
  title: string;
  caption: string;
  children: ReactNode;
  style?: any;
}) {
  const { tokens } = useTheme();
  // Plain title + caption: the hero figure is the only loud element on Overview.
  return (
    <View style={[{ marginBottom: space.s7 }, style]}>
      <Text accessibilityRole="header" style={[type.h2, { color: tokens.colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1, marginBottom: space.s4 }]}>
        {caption}
      </Text>
      {children}
    </View>
  );
}

/** Centered title block shared by the non-dashboard states. */
function StateIntro({ title, caption, children }: { title: string; caption: string; children?: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={{ alignItems: 'center', marginBottom: space.s6 }}>
      {children}
      <Text accessibilityRole="header" style={[type.h1, { color: tokens.colors.text, textAlign: 'center' }]}>
        {title}
      </Text>
      <Text style={[type.body, { color: tokens.colors.textMuted, textAlign: 'center', marginTop: space.s2 }]}>
        {caption}
      </Text>
    </View>
  );
}

/** Numbered step marker that becomes a checkmark once done. */
function StepBadge({ step, done }: { step: number; done: boolean }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: done ? tokens.colors.incomeSubtle : tokens.colors.brandSubtle,
      }}
    >
      {done ? (
        <Icon name="checkmark" size={18} color={tokens.colors.income} />
      ) : (
        <Text style={[type.bodyMed, { color: tokens.colors.onBrandSubtle }]}>{step}</Text>
      )}
    </View>
  );
}

/** Mirrors the dashboard's shape so content doesn't jump when data lands. */
function DashboardSkeleton() {
  return (
    <View accessibilityLabel="Loading overview">
      <Skeleton height={176} borderRadius={radius.lg} style={{ marginBottom: space.s3 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s3, marginBottom: space.s7 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width="48%" height={96} borderRadius={radius.lg} />
        ))}
      </View>
      <Skeleton width="40%" height={24} style={{ marginBottom: space.s2 }} />
      <Skeleton width="70%" height={14} style={{ marginBottom: space.s4 }} />
      <Skeleton height={200} borderRadius={radius.lg} />
    </View>
  );
}

export default function HomeScreen() {
  // All hooks must be called at the top, before any conditional logic
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { showToast } = useToast();
  const { data, loading, activeBudget, appData, refreshTrigger, refreshData, addBudget } = useBudgetData();
  const { isLocked, authenticateForBudget } = useBudgetLock();

  const [authenticating, setAuthenticating] = useState(false);
  const [budgetName, setBudgetName] = useState('My budget');
  const [creatingBudget, setCreatingBudget] = useState(false);

  // State for global view mode
  const [globalViewMode, setGlobalViewMode] = useState<'daily' | 'monthly' | 'yearly'>('monthly');

  // Loading state management to prevent flickering
  const [isDataReady, setIsDataReady] = useState(false);

  const appState = useRef(AppState.currentState);

  // Track when data is ready to prevent flickering
  useEffect(() => {
    if (!loading && appData) {
      const timer = setTimeout(() => setIsDataReady(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsDataReady(false);
    }
  }, [loading, appData]);

  const hasBudgets = !!appData?.budgets && appData.budgets.length > 0;
  const people = useMemo(() => (Array.isArray(data?.people) ? data.people : []), [data]);
  const expenses = useMemo(() => (Array.isArray(data?.expenses) ? data.expenses : []), [data]);

  const budgetLocked = useMemo(() => {
    if (!hasBudgets || !activeBudget) return false;
    return isLocked(activeBudget);
  }, [hasBudgets, activeBudget, isLocked]);

  const calculations = useMemo(() => {
    if (!isDataReady || !hasBudgets || !activeBudget || !data) return null;
    const totalIncome = calculateTotalIncome(people);
    const totalExpenses = calculateTotalExpenses(expenses);
    return {
      totalIncome,
      totalExpenses,
      householdExpenses: calculateHouseholdExpenses(expenses),
      personalExpenses: calculatePersonalExpenses(expenses),
      remaining: totalIncome - totalExpenses,
    };
    // refreshTrigger forces a recalculation after background syncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataReady, hasBudgets, activeBudget, data, people, expenses, refreshTrigger]);

  const handleViewModeChange = useCallback((mode: 'daily' | 'monthly' | 'yearly') => {
    setGlobalViewMode(mode);
  }, []);

  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    appState.current = nextAppState;
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!activeBudget) return;
    setAuthenticating(true);
    try {
      const success = await authenticateForBudget(activeBudget.id);
      if (!success) showToast('Authentication failed', 'error');
    } catch (error) {
      console.error('HomeScreen: Authentication error:', error);
      showToast('Authentication error', 'error');
    } finally {
      setAuthenticating(false);
    }
  }, [activeBudget, authenticateForBudget, showToast]);

  const handleCreateBudget = useCallback(async () => {
    if (!budgetName.trim()) return;
    setCreatingBudget(true);
    try {
      // useBudgetData refreshes and makes the new budget active.
      const result = await addBudget(budgetName.trim());
      if (!result.success) showToast('Couldn’t create the budget. Please try again.', 'error');
    } catch (error) {
      console.error('HomeScreen: Error creating budget:', error);
      showToast('Couldn’t create the budget. Please try again.', 'error');
    } finally {
      setCreatingBudget(false);
    }
  }, [budgetName, addBudget, showToast]);

  useFocusEffect(
    useCallback(() => {
      refreshData(true);
      const subscription = AppState.addEventListener('change', handleAppStateChange);
      return () => subscription?.remove();
    }, [handleAppStateChange, refreshData])
  );

  // ---------------------------------------------------------------------------
  // State → body
  // ---------------------------------------------------------------------------

  type ViewState = 'loading' | 'noBudget' | 'locked' | 'setup' | 'dashboard';
  const state: ViewState =
    loading || !isDataReady
      ? 'loading'
      : !hasBudgets
        ? 'noBudget'
        : budgetLocked
          ? 'locked'
          : !activeBudget || people.length === 0 || expenses.length === 0 || !calculations
            ? 'setup'
            : 'dashboard';

  const hasPeople = people.length > 0;
  const hasExpenses = expenses.length > 0;
  const budgetTitle = activeBudget?.name || 'Budget';
  // Narrow, centered column for the onboarding-style states.
  const narrow = { width: '100%' as const, maxWidth: 520, alignSelf: 'center' as const };

  const renderBody = () => {
    switch (state) {
      case 'loading':
        return <DashboardSkeleton />;

      case 'noBudget':
        return (
          <View style={narrow}>
            <StateIntro title="Welcome to Budget Flow" caption="Start by naming your budget. You can add more budgets later.">
              <Image
                source={require('../assets/images/icon.png')}
                accessibilityIgnoresInvertColors
                style={{ width: 72, height: 72, borderRadius: radius.lg, marginBottom: space.s5 }}
              />
            </StateIntro>
            <Card>
              <Input
                label="Budget name"
                value={budgetName}
                onChangeText={setBudgetName}
                placeholder="e.g. Family budget"
                maxLength={50}
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateBudget}
              />
              <Button
                text="Create budget"
                onPress={handleCreateBudget}
                loading={creatingBudget}
                disabled={!budgetName.trim()}
                size="lg"
                style={{ marginTop: space.s5 }}
              />
            </Card>
          </View>
        );

      case 'locked':
        return (
          <View style={{ minHeight: 480 }}>
            {/* Blurred stand-in for the dashboard behind the lock. */}
            <View style={{ opacity: 0.5 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <DashboardSkeleton />
            </View>
            <BlurView
              intensity={24}
              tint={tokens.isDark ? 'dark' : 'light'}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                padding: space.s6,
              }}
            >
              <Card style={{ width: '100%', maxWidth: 360, alignItems: 'center' }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: radius.full,
                    backgroundColor: tokens.colors.brandSubtle,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: space.s4,
                  }}
                >
                  <Icon name="lock-closed" size={28} color={tokens.colors.brand} />
                </View>
                <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text, textAlign: 'center' }]}>
                  {budgetTitle} is locked
                </Text>
                <Text
                  style={[type.body, { color: tokens.colors.textMuted, textAlign: 'center', marginTop: space.s1, marginBottom: space.s5 }]}
                >
                  Unlock with Face ID, Touch ID or your passcode to view it.
                </Text>
                <Button
                  text="Unlock"
                  icon={<Icon name="lock-open-outline" size={18} color={tokens.colors.onBrand} />}
                  onPress={handleUnlock}
                  loading={authenticating}
                  style={{ marginTop: 0 }}
                />
                <Button
                  text="Switch budget"
                  variant="ghost"
                  onPress={() => router.push('/budgets')}
                  disabled={authenticating}
                />
              </Card>
            </BlurView>
          </View>
        );

      case 'setup': {
        const doneCount = (hasPeople ? 1 : 0) + (hasExpenses ? 1 : 0);
        const next = !hasPeople
          ? { label: 'Add people and income', go: () => router.push('/people') }
          : { label: 'Add an expense', go: () => router.push('/add-expense') };
        return (
          <View style={narrow}>
            <StateIntro
              title={`Set up ${budgetTitle}`}
              caption="Two quick steps and your overview fills in with income, spending and what’s left."
            />
            <ListGroup header={`${doneCount} of 2 done`}>
              <ListRow
                title="Add people and income"
                caption={
                  hasPeople
                    ? `${people.length} ${people.length === 1 ? 'person' : 'people'} added`
                    : 'Everyone who shares costs, with their income'
                }
                leading={<StepBadge step={1} done={hasPeople} />}
                chevron
                onPress={() => router.push('/people')}
                accessibilityLabel={`Step 1, add people and income, ${hasPeople ? 'done' : 'to do'}`}
              />
              <ListRow
                title="Add expenses"
                caption={
                  hasExpenses
                    ? `${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'} added`
                    : 'Household and personal costs, with how often they’re paid'
                }
                leading={<StepBadge step={2} done={hasExpenses} />}
                chevron
                onPress={() => router.push(hasExpenses ? '/expenses' : '/add-expense')}
                accessibilityLabel={`Step 2, add expenses, ${hasExpenses ? 'done' : 'to do'}`}
                showSeparator={false}
              />
            </ListGroup>
            <Button text={next.label} onPress={next.go} size="lg" style={{ marginTop: 0 }} />
          </View>
        );
      }

      case 'dashboard':
        return calculations ? (
          <>
            <DashboardSection title="Overview" caption="Income, spending and what's left for the period.">
              <OverviewSection
                calculations={calculations}
                people={people}
                expenses={expenses}
                householdSettings={data.householdSettings}
                onViewModeChange={handleViewModeChange}
              />
            </DashboardSection>

            <DashboardSection
              title="Individual breakdowns"
              caption="How each person's income covers their personal costs and household share."
            >
              <IndividualBreakdownsSection
                people={people}
                expenses={expenses}
                householdSettings={data.householdSettings}
                totalHouseholdExpenses={calculations.householdExpenses}
                viewMode={globalViewMode}
              />
            </DashboardSection>

            <DashboardSection title="Expense breakdown" caption="Where the money goes, by category.">
              <ExpenseBreakdownSection
                key={`expense-breakdown-${activeBudget?.id || 'no-budget'}`}
                expenses={expenses}
                people={people}
                viewMode={globalViewMode}
              />
            </DashboardSection>

            {/* Debt & Expiring: side by side on medium+, stacked on compact */}
            <View
              style={{
                flexDirection: breakpoint.isCompact ? 'column' : 'row',
                gap: breakpoint.isCompact ? 0 : space.s6,
              }}
            >
              <DashboardSection
                title="Debt repayments"
                caption="Loan, mortgage and credit card payments."
                style={breakpoint.isCompact ? undefined : { flex: 1 }}
              >
                <View style={[themedStyles.card, { marginBottom: 0, padding: 0, flex: breakpoint.isCompact ? undefined : 1 }]}>
                  <DebtRepaymentSection expenses={expenses} people={people} />
                </View>
              </DashboardSection>

              <DashboardSection
                title="Ending & expired"
                caption="Recurring expenses with end dates coming up or passed."
                style={breakpoint.isCompact ? undefined : { flex: 1 }}
              >
                <View style={[themedStyles.card, { marginBottom: 0, padding: 0, flex: breakpoint.isCompact ? undefined : 1 }]}>
                  <ExpiringSection expenses={expenses} />
                </View>
              </DashboardSection>
            </View>
          </>
        ) : null;
    }
  };

  // The rail and sidebar already name the budget on medium+; the first-budget
  // screen is a welcome, so it has no header at all.
  const showHeader = breakpoint.isCompact && state !== 'noBudget';

  return (
    <KeyboardAvoidingView
      style={themedStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={state === 'noBudget'}
    >
      {showHeader ? (
        <StandardHeader
          title={state === 'loading' ? '' : budgetTitle}
          showLeftIcon={false}
          showRightIcon={state !== 'loading'}
          rightIcon="wallet-outline"
          onRightPress={() => router.push('/budgets')}
        />
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          themedStyles.scrollContent,
          {
            paddingHorizontal: breakpoint.gutter,
            paddingTop: state === 'noBudget' || state === 'setup' ? space.s9 : space.s4,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: breakpoint.contentMaxWidth, alignSelf: 'center' }}>{renderBody()}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
