import React, { useCallback, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import ToolLayout from '../../components/tools/ToolLayout';
import { useChartFormat } from '../../components/charts/useChartFormat';
import AllocationBar, { type AllocationSegment } from '../../components/tools/AllocationBar';
import BucketCard from '../../components/tools/BucketCard';
import CategoryBucketSheet from '../../components/tools/CategoryBucketSheet';
import DebtHelpNudge from '../../components/tools/DebtHelpNudge';
import { BUCKET_META, statusLabel } from '../../components/tools/bucketMeta';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Card, EmptyState } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import { useBudgetData } from '../../hooks/useBudgetData';
import { useBudgetLock } from '../../hooks/useBudgetLock';
import { useDebtHelpNudge } from '../../hooks/useDebtHelpNudge';
import {
  BUCKET_ORDER,
  TARGET_PCT,
  bucketToStore,
  furthestOff,
  missPoints,
  reviewBudget,
  suggestSaving,
  type BucketId,
  type BudgetReview,
  type CategoryShare,
} from '../../utils/budgetReview';
import { type, space, radius, tabularNums } from '../../styles/tokens';

const headline = (onTrack: number): string =>
  onTrack === 3 ? 'All three on target' : onTrack === 0 ? 'None on target' : `${onTrack === 1 ? 'One' : 'Two'} of three on target`;

export default function BudgetReviewScreen() {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const money = useChartFormat();
  const { showToast } = useToast();
  const { data, activeBudget, sharing, setCategoryBucket } = useBudgetData();
  const { isLocked, authenticateForBudget } = useBudgetLock();
  const [authenticating, setAuthenticating] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [savingChoice, setSavingChoice] = useState(false);

  const budgetName = activeBudget?.name || 'your budget';
  const locked = !!activeBudget && isLocked(activeBudget);

  const choices = activeBudget?.categoryBuckets;
  const review = useMemo(
    () => (activeBudget && !locked ? reviewBudget(data?.people ?? [], data?.expenses ?? [], { buckets: choices }) : null),
    [activeBudget, locked, data, choices]
  );

  const debtHelp = useDebtHelpNudge(review);

  // The category open in the sheet, read from the latest review so it follows a move.
  const selected = useMemo(() => {
    const match = (review?.buckets ?? [])
      .map((b) => ({ bucket: b.id, category: b.categories.find((c) => c.name === selectedName) }))
      .find((m) => m.category);
    return match?.category ? { category: match.category, bucket: match.bucket } : null;
  }, [review, selectedName]);
  const shared = !!activeBudget && (sharing[activeBudget.id]?.memberCount ?? 1) > 1;

  const handleUnlock = useCallback(async () => {
    if (!activeBudget || authenticating) return;
    setAuthenticating(true);
    try {
      const success = await authenticateForBudget(activeBudget.id);
      if (!success) showToast('Authentication failed', 'error');
    } catch (e) {
      console.log('BudgetReview: authentication error', e);
      showToast('Authentication error', 'error');
    } finally {
      setAuthenticating(false);
    }
  }, [activeBudget, authenticating, authenticateForBudget, showToast]);

  const openCategory = useCallback((name: string) => {
    // Same hand-off as the dashboard's category breakdown.
    router.navigate({ pathname: '/expenses', params: { category: name, fromDashboard: 'true', _t: String(Date.now()) } });
  }, []);

  const openSavings = useCallback((deposit: number) => {
    // The `_t` stamp makes a repeat visit with the same amount look like a new hand-off, as on the dashboard.
    router.navigate({ pathname: '/tools/savings', params: { deposit: String(deposit), _t: String(Date.now()) } });
  }, []);

  const saveChoice = useCallback(
    async (category: CategoryShare, bucket: BucketId | null) => {
      setSavingChoice(true);
      try {
        const res = await setCategoryBucket(category.name, bucket);
        if (!res.success) showToast('Couldn’t save that change. Please try again.', 'error');
      } catch (e) {
        console.log('BudgetReview: save choice error', e);
        showToast('Couldn’t save that change. Please try again.', 'error');
      } finally {
        setSavingChoice(false);
      }
    },
    [setCategoryBucket, showToast]
  );

  const handleCopy = async (r: BudgetReview) => {
    const lines = r.buckets.map((b) => {
      const gap =
        b.shownPct === b.targetPct
          ? 'right on target'
          : `${formatCurrency(Math.abs(b.gapMonthly))}/mo ${b.gapMonthly > 0 ? 'above' : b.id === 'savings' ? 'short of' : 'under'} target`;
      return `${BUCKET_META[b.id].name}: ${b.shownPct}% (${formatCurrency(b.monthly)}/mo), target ${b.targetPct}% (${formatCurrency(b.targetMonthly)}/mo), ${statusLabel(b.id, b.status).toLowerCase()}, ${gap}`;
    });
    const text = `Budget review: 50/30/20
Budget: ${activeBudget?.name ?? ''}
Income: ${formatCurrency(r.incomeMonthly)}/mo
Spending: ${formatCurrency(r.spendingMonthly)}/mo
${r.overspent ? 'Over income by' : 'Left over'}: ${formatCurrency(Math.abs(r.leftoverMonthly))}/mo
${lines.join('\n')}`;
    try {
      await Clipboard.setStringAsync(text);
      showToast('Results copied to clipboard', 'success');
    } catch (e) {
      console.log('Copy error', e);
      showToast('Failed to copy', 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // Left column on wide screens, first on a phone: what the rule is.
  // ---------------------------------------------------------------------------

  const explainer = (
    <Card title="The 50/30/20 rule">
      <Text style={[type.body, { color: tokens.colors.text }]}>
        A simple way to split your take-home pay, from the 2005 book All Your Worth by Elizabeth Warren and Amelia Warren Tyagi.
      </Text>
      <View style={{ gap: space.s4, marginTop: space.s4 }}>
        {BUCKET_ORDER.map((id) => {
          const meta = BUCKET_META[id];
          return (
            <View key={id} style={{ flexDirection: 'row', gap: space.s3 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.full,
                  backgroundColor: tokens.colors[`${meta.tone}Subtle` as const],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={meta.icon} size={22} color={tokens.colors[meta.tone]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyMed, { color: tokens.colors.text }]}>
                  {TARGET_PCT[id]}% {meta.name}
                </Text>
                <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{meta.blurb}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s4 }]}>
        The shares are of income after tax, so the income in your budget is treated as take-home pay. It’s a guideline, not a law: where
        housing is expensive, needs often take more than half. The point is to see where your money goes and what you could shift.
      </Text>
    </Card>
  );

  // ---------------------------------------------------------------------------
  // The review itself.
  // ---------------------------------------------------------------------------

  const results = (() => {
    if (!activeBudget) {
      return (
        <Card>
          <EmptyState
            icon="wallet-outline"
            title="No budget to review"
            caption="Create a budget on the Home tab, then come back to compare it with the rule."
            actionLabel="Go to Home"
            onAction={() => router.navigate('/')}
          />
        </Card>
      );
    }
    if (locked) {
      return (
        <Card>
          <EmptyState
            icon="lock-closed"
            title={`${budgetName} is locked`}
            caption="Unlock it with Face ID, Touch ID or your passcode to compare it with the rule."
            actionLabel={authenticating ? 'Unlocking…' : 'Unlock'}
            onAction={handleUnlock}
          />
        </Card>
      );
    }
    if (!review) {
      return (
        <Card>
          <EmptyState
            icon="people-outline"
            title="Add income to compare"
            caption="The rule is a share of income, so the budget needs at least one source of income."
            actionLabel="Add people and income"
            onAction={() => router.push('/people')}
          />
        </Card>
      );
    }
    if (review.spendingMonthly <= 0) {
      return (
        <Card>
          <EmptyState
            icon="receipt-outline"
            title="Add expenses to review"
            caption="Once the budget has expenses they’re sorted into Needs, Wants and Savings here."
            actionLabel="Add an expense"
            onAction={() => router.push('/add-expense')}
          />
        </Card>
      );
    }

    const { buckets, incomeMonthly, spendingMonthly, leftoverMonthly, overspent } = review;
    const savings = buckets.find((b) => b.id === 'savings')!;
    const worst = furthestOff(review);
    const leftoverPct = incomeMonthly > 0 ? Math.max(0, (leftoverMonthly / incomeMonthly) * 100) : 0;
    const saving = suggestSaving(review);

    // Both bars share one scale so they line up: income normally, spending when it runs past income.
    const scale = Math.max(incomeMonthly, spendingMonthly);
    const onColor = { household: tokens.colors.onHousehold, personal: tokens.colors.onPersonal, mortgage: tokens.colors.onBrand };
    const targetSegments: AllocationSegment[] = BUCKET_ORDER.map((id) => {
      const meta = BUCKET_META[id];
      return {
        key: id,
        fraction: (TARGET_PCT[id] / 100) * (incomeMonthly / scale),
        color: tokens.colors[meta.tone],
        label: `${TARGET_PCT[id]}%`,
        labelColor: onColor[meta.tone],
      };
    });
    const yourSegments: AllocationSegment[] = buckets.map((b) => {
      const meta = BUCKET_META[b.id];
      return { key: b.id, fraction: b.monthly / scale, color: tokens.colors[meta.tone], label: `${b.shownPct}%`, labelColor: onColor[meta.tone] };
    });
    if (leftoverMonthly > 0) {
      yourSegments.push({
        key: 'unallocated',
        fraction: leftoverMonthly / scale,
        color: tokens.colors.borderStrong,
        label: `${Math.round(leftoverPct)}%`,
        labelColor: tokens.colors.text,
      });
    }

    const legend = [
      ...buckets.map((b) => ({
        key: b.id,
        color: tokens.colors[BUCKET_META[b.id].tone],
        text: `${BUCKET_META[b.id].name} ${b.shownPct}%`,
      })),
      ...(leftoverMonthly > 0
        ? [{ key: 'unallocated', color: tokens.colors.borderStrong, text: `Unallocated ${Math.round(leftoverPct)}%` }]
        : []),
    ];
    const barSummary = (label: string, parts: string[]) => `${label}: ${parts.join(', ')} of income.`;

    return (
      <View style={{ gap: space.s4 }}>
        <Card title="How you compare">
          <Text style={[type.h2, { color: tokens.colors.text }]}>{headline(review.onTrackCount)}</Text>
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]}>
            {worst
              ? `${BUCKET_META[worst.id].name} is furthest from its target: ${missPoints(worst)} ${
                  missPoints(worst) === 1 ? 'point' : 'points'
                } ${worst.id === 'savings' ? 'under' : 'over'}.`
              : 'Needs and Wants are within their limits and Savings reaches its goal.'}
          </Text>

          <View style={{ marginTop: space.s4, gap: space.s3 }}>
            <View>
              <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s1 }]}>50/30/20 target</Text>
              <AllocationBar
                segments={targetSegments}
                accessibilityLabel={barSummary('Target', BUCKET_ORDER.map((id) => `${BUCKET_META[id].name} ${TARGET_PCT[id]}%`))}
              />
            </View>
            <View>
              <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s1 }]}>Your budget</Text>
              <AllocationBar
                segments={yourSegments}
                accessibilityLabel={barSummary(
                  'Your budget',
                  [...buckets.map((b) => `${BUCKET_META[b.id].name} ${b.shownPct}%`), ...(leftoverMonthly > 0 ? [`unallocated ${Math.round(leftoverPct)}%`] : [])]
                )}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.s4, rowGap: space.s2, marginTop: space.s3 }}>
            {legend.map((item) => (
              <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: item.color }} />
                <Text style={[type.caption, tabularNums, { color: tokens.colors.text }]}>{item.text}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: space.s4, marginTop: space.s4 }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Income</Text>
              <Text style={[type.bodyMed, tabularNums, { color: tokens.colors.text }]}>{formatCurrency(incomeMonthly)}/mo</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Spending</Text>
              <Text style={[type.bodyMed, tabularNums, { color: tokens.colors.text }]}>{formatCurrency(spendingMonthly)}/mo</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{overspent ? 'Over income by' : 'Left over'}</Text>
              <Text
                style={[
                  type.bodyMed,
                  tabularNums,
                  { color: overspent ? tokens.colors.expense : leftoverMonthly > 0 ? tokens.colors.income : tokens.colors.text },
                ]}
              >
                {formatCurrency(Math.abs(leftoverMonthly))}/mo
              </Text>
            </View>
          </View>

          {overspent ? (
            <View
              style={{
                flexDirection: 'row',
                gap: space.s2,
                marginTop: space.s4,
                padding: space.s3,
                borderRadius: radius.md,
                backgroundColor: tokens.colors.dangerSubtle,
              }}
            >
              <Icon name="warning" size={18} color={tokens.colors.danger} />
              <Text style={[type.caption, { flex: 1, color: tokens.colors.text }]}>
                You’re spending {formatCurrency(Math.abs(leftoverMonthly))}/mo more than you earn, so your bar runs past the target and
                the shares above add up to more than 100%. The rule assumes spending stays within income.
              </Text>
            </View>
          ) : saving ? (
            <View
              style={{
                marginTop: space.s4,
                padding: space.s3,
                borderRadius: radius.md,
                backgroundColor: tokens.colors.brandSubtle,
              }}
            >
              <View style={{ flexDirection: 'row', gap: space.s2 }}>
                <Icon name="information-circle" size={18} color={tokens.colors.brand} />
                <Text style={[type.caption, { flex: 1, color: tokens.colors.text }]}>
                  {formatCurrency(leftoverMonthly)}/mo isn’t assigned to anything.{' '}
                  {saving.mode === 'reaches'
                    ? `Putting ${money.whole(saving.amount)}/mo of it into Savings would bring it to its ${TARGET_PCT.savings}% target.`
                    : saving.mode === 'short'
                      ? `Putting all of it into Savings would take it from ${savings.shownPct}% to ${saving.pctAfter}%, still under the ${TARGET_PCT.savings}% target.`
                      : `Savings already reaches its ${TARGET_PCT.savings}% target. Putting all of it in would make Savings ${saving.pctAfter}% of your income.`}
                </Text>
              </View>
              <Button
                variant="ghost"
                text={`See what ${money.whole(saving.amount)}/mo could grow into`}
                onPress={() => openSavings(saving.amount)}
                style={{ marginTop: space.s1 }}
              />
            </View>
          ) : null}
        </Card>

        {debtHelp.signal ? (
          <DebtHelpNudge
            signal={debtHelp.signal}
            onOpen={() => router.navigate('/tools/debt-help')}
            onDismiss={debtHelp.dismiss}
          />
        ) : null}

        {buckets.map((b) => (
          <BucketCard key={b.id} bucket={b} onOpenCategory={(c) => setSelectedName(c.name)} />
        ))}

        <Text style={[type.caption, { color: tokens.colors.textMuted, marginHorizontal: space.s2 }]}>
          A guideline, not advice. Expenses are counted per month from the active budget, and ones that have ended are left out. Loan
          and Credit Card payments start in Needs (minimum payments); Misc and custom categories start in Wants. Tap a category under
          “What’s in it” to move it; the change is shared with everyone on the budget.
        </Text>

        <Button text="Copy results" onPress={() => handleCopy(review)} variant="secondary" style={{ marginTop: 0 }} />
      </View>
    );
  })();

  return (
    <>
      <ToolLayout
        title="Budget review"
        intro={`Compare ${budgetName} with the 50/30/20 rule.`}
        inputs={explainer}
        results={results}
      />
      <CategoryBucketSheet
        visible={!!selected}
        onClose={() => setSelectedName(null)}
        category={selected?.category ?? null}
        bucket={selected?.bucket ?? 'wants'}
        shared={shared}
        saving={savingChoice}
        onChoose={(bucket) => selected && saveChoice(selected.category, bucketToStore(selected.category.name, bucket))}
        onReset={() => selected && saveChoice(selected.category, null)}
        onShowExpenses={() => {
          if (!selected) return;
          const name = selected.category.name;
          setSelectedName(null);
          openCategory(name);
        }}
      />
    </>
  );
}
