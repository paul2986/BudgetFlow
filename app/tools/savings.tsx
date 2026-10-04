import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import ToolLayout from '../../components/tools/ToolLayout';
import YearTable from '../../components/tools/YearTable';
import AreaChart from '../../components/charts/AreaChart';
import { useChartFormat } from '../../components/charts/useChartFormat';
import { yearTicks } from '../../components/charts/chartScale';
import Button from '../../components/Button';
import CurrencyInput from '../../components/CurrencyInput';
import Icon from '../../components/Icon';
import { Card, ChoicePills, EmptyState, Input, SegmentedControl } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import { useBudgetData } from '../../hooks/useBudgetData';
import { useBudgetLock } from '../../hooks/useBudgetLock';
import { calculateMonthlyAmount, calculateTotalExpenses, calculateTotalIncome } from '../../utils/calculations';
import { projectSavings, type ContributionFrequency } from '../../utils/projections';
import { formatDuration } from '../../utils/formatDuration';
import { cleanDecimal, parseAmount } from '../../utils/numberInput';
import { type, space, radius, tabularNums } from '../../styles/tokens';

const FREQUENCIES = [
  { value: 'daily' as const, label: 'Daily' },
  { value: 'weekly' as const, label: 'Weekly' },
  { value: 'monthly' as const, label: 'Monthly' },
];

const YEAR_PRESETS = ['5', '10', '20', '30', '40'].map((y) => ({ value: y, label: `${y} yrs` }));
const MAX_YEARS = 60;

export default function SavingsScreen() {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const { showToast } = useToast();
  const money = useChartFormat();
  const { data, activeBudget } = useBudgetData();
  const { isLocked } = useBudgetLock();

  const [startInput, setStartInput] = useState('');
  const [depositInput, setDepositInput] = useState('');
  const [frequency, setFrequency] = useState<ContributionFrequency>('monthly');
  const [rateInput, setRateInput] = useState('');
  const [yearsInput, setYearsInput] = useState('20');
  const [touched, setTouched] = useState<{ rate?: boolean; years?: boolean }>({});

  // The Budget review hands over the monthly amount it suggests saving. This screen stays mounted
  // between visits, so a fresh hand-off has to replace whatever deposit was typed before.
  const params = useLocalSearchParams<{ deposit?: string; _t?: string }>();
  useEffect(() => {
    const handed = parseAmount(params.deposit ?? '');
    if (handed === null || handed <= 0) return;
    setDepositInput(cleanDecimal(String(handed)));
    setFrequency('monthly');
  }, [params.deposit, params._t]);

  const start = parseAmount(startInput) ?? 0;
  const deposit = parseAmount(depositInput) ?? 0;
  const rate = rateInput.trim() === '' ? null : parseAmount(rateInput);
  const years = parseAmount(yearsInput);

  const rateError = rate === null || rate > 100 ? 'Enter a yearly rate between 0 and 100.' : undefined;
  const yearsError = years === null || years < 1 || years > MAX_YEARS ? `Enter between 1 and ${MAX_YEARS} years.` : undefined;
  const hasMoney = start > 0 || deposit > 0;

  const projection = useMemo(
    () =>
      !rateError && !yearsError && hasMoney
        ? projectSavings({ startingBalance: start, contribution: deposit, frequency, annualRatePct: rate!, years: years! })
        : null,
    [rateError, yearsError, hasMoney, start, deposit, frequency, rate, years]
  );

  // What is left each month once the budget's expenses are paid, if the active budget is open.
  const monthlySurplus = useMemo(() => {
    if (!activeBudget || isLocked(activeBudget)) return null;
    const left = calculateTotalIncome(data?.people ?? []) - calculateTotalExpenses(data?.expenses ?? []);
    const monthly = Math.floor(calculateMonthlyAmount(left, 'yearly'));
    return monthly > 0 ? monthly : null;
  }, [activeBudget, isLocked, data]);

  const chart = useMemo(() => {
    if (!projection) return null;
    const { points } = projection;
    return {
      series: [
        { key: 'contributed', label: 'You put in', color: tokens.colors.brand, values: points.map((p) => p.contributed) },
        { key: 'interest', label: 'Interest earned', color: tokens.colors.income, values: points.map((p) => p.balance - p.contributed) },
      ],
      xTicks: yearTicks(points.length - 1).map((index) => ({ index, label: index === 0 ? 'Now' : `${index / 12} yr` })),
    };
  }, [projection, tokens.colors.brand, tokens.colors.income]);

  const handleReset = () => {
    setStartInput('');
    setDepositInput('');
    setFrequency('monthly');
    setRateInput('');
    setYearsInput('20');
    setTouched({});
  };

  const handleCopy = async () => {
    if (!projection) return;
    const months = projection.points.length - 1;
    const text = `Savings growth
Starting balance: ${formatCurrency(start)}
Deposit: ${formatCurrency(deposit)} ${frequency}
Interest rate: ${rate}% a year
Time: ${formatDuration(months)}
Balance: ${formatCurrency(projection.finalBalance)}
You put in: ${formatCurrency(projection.totalContributed)}
Interest earned: ${formatCurrency(projection.interestEarned)}`;
    try {
      await Clipboard.setStringAsync(text);
      showToast('Results copied to clipboard', 'success');
    } catch (e) {
      console.log('Copy error', e);
      showToast('Failed to copy', 'error');
    }
  };

  const inputs = (
    <Card>
      <View style={{ gap: space.s5 }}>
        <CurrencyInput label="Starting balance (optional)" value={startInput} onChangeText={setStartInput} />

        <View>
          <CurrencyInput label="Regular deposit" value={depositInput} onChangeText={setDepositInput} />
          <SegmentedControl
            label="How often you deposit"
            options={FREQUENCIES}
            value={frequency}
            onChange={setFrequency}
            style={{ marginTop: space.s3 }}
          />
          {monthlySurplus !== null ? (
            <Button
              variant="ghost"
              text={`Use my monthly surplus (${formatCurrency(monthlySurplus)})`}
              onPress={() => {
                setDepositInput(String(monthlySurplus));
                setFrequency('monthly');
              }}
              style={{ marginTop: space.s2 }}
            />
          ) : null}
        </View>

        <Input
          label="Interest rate (% a year)"
          value={rateInput}
          onChangeText={(t) => setRateInput(cleanDecimal(t))}
          onBlur={() => setTouched((v) => ({ ...v, rate: true }))}
          keyboardType="decimal-pad"
          placeholder="e.g. 4.5"
          helperText="The yearly rate your bank advertises (AER or APY). Use 0 for none."
          error={touched.rate ? rateError : undefined}
        />

        <View>
          <Input
            label="Time period (years)"
            value={yearsInput}
            onChangeText={(t) => setYearsInput(cleanDecimal(t, 0))}
            onBlur={() => setTouched((v) => ({ ...v, years: true }))}
            keyboardType="number-pad"
            placeholder="e.g. 20"
            error={touched.years ? yearsError : undefined}
          />
          <ChoicePills
            label="Common time periods"
            showLabel={false}
            options={YEAR_PRESETS}
            value={YEAR_PRESETS.find((p) => p.value === yearsInput.trim())?.value}
            onChange={setYearsInput}
            style={{ marginTop: space.s3 }}
          />
        </View>
      </View>
    </Card>
  );

  const results = (() => {
    if (!projection || !chart) {
      return (
        <Card>
          <EmptyState
            icon="trending-up-outline"
            title="Your projection appears here"
            caption="Enter a deposit or starting balance, an interest rate and a time period."
          />
        </Card>
      );
    }
    const months = projection.points.length - 1;
    const interestShare = projection.finalBalance > 0 ? Math.round((projection.interestEarned / projection.finalBalance) * 100) : 0;
    const { points, yearly } = projection;

    const readout = (i: number) => [
      { key: 'balance', label: 'Balance', value: money.whole(points[i].balance), strong: true },
      { key: 'contributed', label: 'You put in', value: money.whole(points[i].contributed), color: tokens.colors.brand },
      {
        key: 'interest',
        label: 'Interest earned',
        value: money.whole(points[i].balance - points[i].contributed),
        color: tokens.colors.income,
      },
    ];

    return (
      <View style={{ gap: space.s4 }}>
        <Card title="Projection">
          <Text style={[type.caption, { color: tokens.colors.textMuted }]}>After {formatDuration(months)} you could have</Text>
          <Text style={[type.display, tabularNums, { color: tokens.colors.text, marginTop: space.s1 }]} numberOfLines={1} adjustsFontSizeToFit>
            {money.whole(projection.finalBalance)}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.s4, marginTop: space.s4 }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: tokens.colors.textMuted }]}>You put in</Text>
              <Text style={[type.h3, tabularNums, { color: tokens.colors.text, marginTop: space.s1 }]}>
                {money.whole(projection.totalContributed)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Interest earned</Text>
              <Text style={[type.h3, tabularNums, { color: tokens.colors.income, marginTop: space.s1 }]}>
                {money.whole(projection.interestEarned)}
              </Text>
            </View>
          </View>
          {projection.interestEarned > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.s2,
                marginTop: space.s4,
                padding: space.s3,
                borderRadius: radius.md,
                backgroundColor: tokens.colors.incomeSubtle,
              }}
            >
              <Icon name="trending-up" size={18} color={tokens.colors.income} />
              <Text style={[type.caption, { flex: 1, color: tokens.colors.text }]}>
                Interest makes up {interestShare}% of the final balance.
              </Text>
            </View>
          ) : null}
        </Card>

        <Card title="Growth over time">
          <AreaChart
            variant="stacked"
            series={chart.series}
            xTicks={chart.xTicks}
            formatAxis={money.axis}
            heading={(i) => (i === 0 ? 'Today' : `After ${formatDuration(i)}`)}
            readout={readout}
            summary={`Savings growth over ${formatDuration(months)}. You put in ${money.whole(projection.totalContributed)} and earn ${money.whole(projection.interestEarned)} in interest, reaching ${money.whole(projection.finalBalance)}.`}
          />
        </Card>

        <YearTable
          title="Year by year"
          caption="Running totals at the end of each year."
          columns={['Year', 'Put in', 'Interest', 'Balance']}
          rows={yearly.map((y) => [`${y.year}`, money.whole(y.contributed), money.whole(y.balance - y.contributed), money.whole(y.balance)])}
        />

        <Text style={[type.caption, { color: tokens.colors.textMuted, marginHorizontal: space.s2 }]}>
          A projection, not a promise: it assumes the rate never changes and each deposit lands at the end of the month. It
          doesn’t allow for tax or inflation.
        </Text>

        <View style={{ flexDirection: 'row', gap: space.s3 }}>
          <View style={{ flex: 1 }}>
            <Button text="Start over" onPress={handleReset} variant="ghost" style={{ marginTop: 0 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Button text="Copy results" onPress={handleCopy} variant="secondary" style={{ marginTop: 0 }} />
          </View>
        </View>
      </View>
    );
  })();

  return (
    <ToolLayout
      title="Savings growth"
      intro="Project how regular deposits and interest build up over time."
      inputs={inputs}
      results={results}
    />
  );
}
