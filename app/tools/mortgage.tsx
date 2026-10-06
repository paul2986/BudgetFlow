import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import ToolLayout from '../../components/tools/ToolLayout';
import YearTable from '../../components/tools/YearTable';
import AreaChart from '../../components/charts/AreaChart';
import BarChart from '../../components/charts/BarChart';
import { useChartFormat } from '../../components/charts/useChartFormat';
import { barYearTicks, yearTicks } from '../../components/charts/chartScale';
import Button from '../../components/Button';
import CurrencyInput from '../../components/CurrencyInput';
import Icon from '../../components/Icon';
import { Card, ChoicePills, EmptyState, Input } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { useToast } from '../../hooks/useToast';
import { projectMortgage } from '../../utils/projections';
import { formatDuration } from '../../utils/formatDuration';
import { cleanDecimal, parseAmount } from '../../utils/numberInput';
import { type, space, tabularNums } from '../../styles/tokens';

const TERM_PRESETS = ['10', '15', '20', '25', '30'].map((y) => ({ value: y, label: `${y} yrs` }));
const MAX_TERM_YEARS = 40;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 2056": the month the last payment lands, counting from today. */
const payoffMonth = (monthsFromNow: number): string => {
  const now = new Date();
  // The 1st, so a 31st never rolls over into the month after.
  const d = new Date(now.getFullYear(), now.getMonth() + monthsFromNow, 1);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

export default function MortgageScreen() {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const { showToast } = useToast();
  const money = useChartFormat();

  const [balanceInput, setBalanceInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [termInput, setTermInput] = useState('25');
  const [extraInput, setExtraInput] = useState('');
  const [touched, setTouched] = useState<{ rate?: boolean; term?: boolean }>({});

  const balance = parseAmount(balanceInput) ?? 0;
  const rate = rateInput.trim() === '' ? null : parseAmount(rateInput);
  const term = parseAmount(termInput);
  const extra = parseAmount(extraInput) ?? 0;

  const rateError = rate === null || rate > 100 ? 'Enter a yearly rate between 0 and 100.' : undefined;
  const termError = term === null || term < 1 || term > MAX_TERM_YEARS ? `Enter between 1 and ${MAX_TERM_YEARS} years.` : undefined;

  const projection = useMemo(
    () =>
      balance > 0 && !rateError && !termError
        ? projectMortgage({ balance, annualRatePct: rate!, termYears: term!, extraMonthly: extra })
        : null,
    [balance, rateError, termError, rate, term, extra]
  );

  // The plan being followed: with extra payments when there are any.
  const plan = projection ? (projection.withExtra ?? projection.baseline) : null;

  const charts = useMemo(() => {
    if (!projection || !plan) return null;
    const { baseline, withExtra } = projection;
    const padded = (balances: number[]) => balances.concat(new Array(baseline.balances.length - balances.length).fill(0));
    return {
      balances: [
        { key: 'scheduled', label: 'Scheduled payments', color: tokens.colors.brand, values: baseline.balances },
        ...(withExtra
          ? [{ key: 'extra', label: 'With extra payments', color: tokens.colors.income, values: padded(withExtra.balances) }]
          : []),
      ],
      balanceTicks: yearTicks(baseline.balances.length - 1).map((index) => ({
        index,
        label: index === 0 ? 'Now' : `${index / 12} yr`,
      })),
      yearly: [
        { key: 'principal', label: 'Principal', color: tokens.colors.brand, values: plan.yearly.map((y) => y.principal) },
        { key: 'interest', label: 'Interest', color: tokens.colors.expense, values: plan.yearly.map((y) => y.interest) },
      ],
      yearlyTicks: barYearTicks(plan.yearly.length).map((index) => ({ index, label: `${index + 1} yr` })),
    };
  }, [projection, plan, tokens.colors.brand, tokens.colors.income, tokens.colors.expense]);

  const handleReset = () => {
    setBalanceInput('');
    setRateInput('');
    setTermInput('25');
    setExtraInput('');
    setTouched({});
  };

  const handleCopy = async () => {
    if (!projection || !plan) return;
    const lines = [
      'Mortgage',
      `Balance: ${formatCurrency(balance)}`,
      `Interest rate: ${rate}% a year`,
      `Time left: ${formatDuration(projection.baseline.months)}`,
      `Monthly payment (principal and interest): ${formatCurrency(projection.payment)}`,
      `Total interest: ${formatCurrency(projection.baseline.totalInterest)}`,
    ];
    if (projection.withExtra) {
      lines.push(
        `With ${formatCurrency(extra)} extra a month: paid off in ${formatDuration(projection.withExtra.months)}, ` +
          `${formatDuration(projection.monthsSaved)} sooner, saving ${formatCurrency(projection.interestSaved)} in interest`
      );
    }
    try {
      await Clipboard.setStringAsync(lines.join('\n'));
      showToast('Results copied to clipboard', 'success');
    } catch (e) {
      console.warn('Copy error', e);
      showToast('Failed to copy', 'error');
    }
  };

  const inputs = (
    <Card>
      <View style={{ gap: space.s5 }}>
        <CurrencyInput label="Mortgage balance (what you still owe)" value={balanceInput} onChangeText={setBalanceInput} />

        <Input
          label="Interest rate (% a year)"
          value={rateInput}
          onChangeText={(t) => setRateInput(cleanDecimal(t))}
          onBlur={() => setTouched((v) => ({ ...v, rate: true }))}
          keyboardType="decimal-pad"
          placeholder="e.g. 5.5"
          helperText="Treated as fixed for the whole term."
          error={touched.rate ? rateError : undefined}
        />

        <View>
          <Input
            label="Time left (years)"
            value={termInput}
            onChangeText={(t) => setTermInput(cleanDecimal(t, 0))}
            onBlur={() => setTouched((v) => ({ ...v, term: true }))}
            keyboardType="number-pad"
            placeholder="e.g. 25"
            error={touched.term ? termError : undefined}
          />
          <ChoicePills
            label="Common mortgage terms"
            showLabel={false}
            options={TERM_PRESETS}
            value={TERM_PRESETS.find((p) => p.value === termInput.trim())?.value}
            onChange={setTermInput}
            style={{ marginTop: space.s3 }}
          />
        </View>

        <View>
          <CurrencyInput label="Extra payment each month (optional)" value={extraInput} onChangeText={setExtraInput} />
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s2 }]}>
            Paid on top of the monthly payment. See how much time and interest it saves.
          </Text>
        </View>
      </View>
    </Card>
  );

  const results = (() => {
    if (!projection || !plan || !charts) {
      return (
        <Card>
          <EmptyState
            icon="home-outline"
            title="Your mortgage plan appears here"
            caption="Enter what you owe, the interest rate and the years left."
          />
        </Card>
      );
    }

    const { baseline, withExtra } = projection;
    const monthsLeft = baseline.months;

    const balanceReadout = (i: number) => [
      {
        key: 'scheduled',
        label: 'Scheduled payments',
        value: money.whole(baseline.balances[i]),
        color: tokens.colors.brand,
        kind: 'line' as const,
      },
      ...(withExtra
        ? [
            {
              key: 'extra',
              label: 'With extra payments',
              value: money.whole(withExtra.balances[i] ?? 0),
              color: tokens.colors.income,
              kind: 'line' as const,
            },
          ]
        : []),
    ];

    const yearReadout = (i: number) => {
      const year = plan.yearly[i];
      return [
        { key: 'paid', label: 'Paid this year', value: money.whole(year.principal + year.interest), strong: true },
        { key: 'principal', label: 'Principal', value: money.whole(year.principal), color: tokens.colors.brand },
        { key: 'interest', label: 'Interest', value: money.whole(year.interest), color: tokens.colors.expense },
        { key: 'owed', label: 'Still owed', value: money.whole(year.balance) },
      ];
    };

    return (
      <View style={{ gap: space.s4 }}>
        <Card title="Monthly payment">
          <Text style={[type.display, tabularNums, { color: tokens.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(projection.payment)}
          </Text>
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]}>
            Principal and interest only. Tax, insurance and fees aren’t included.
          </Text>

          <View style={{ flexDirection: 'row', gap: space.s4, marginTop: space.s4 }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Total interest</Text>
              <Text style={[type.h3, tabularNums, { color: tokens.colors.expense, marginTop: space.s1 }]}>
                {money.whole(baseline.totalInterest)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Mortgage-free by</Text>
              <Text style={[type.h3, tabularNums, { color: tokens.colors.text, marginTop: space.s1 }]}>
                {payoffMonth(monthsLeft)}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: space.s4 }}>
            <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Total you’ll pay</Text>
            <Text style={[type.h3, tabularNums, { color: tokens.colors.text, marginTop: space.s1 }]}>
              {money.whole(baseline.totalPaid)}
            </Text>
          </View>
        </Card>

        {withExtra ? (
          <Card title="With extra payments">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 }}>
              <Icon name="trending-down" size={20} color={tokens.colors.income} />
              <Text style={[type.body, { flex: 1, color: tokens.colors.text }]}>
                Paying {formatCurrency(extra)} extra each month clears the mortgage in {formatDuration(withExtra.months)}, by{' '}
                {payoffMonth(withExtra.months)}.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.s4, marginTop: space.s4 }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Time saved</Text>
                <Text style={[type.h3, tabularNums, { color: tokens.colors.income, marginTop: space.s1 }]}>
                  {formatDuration(projection.monthsSaved)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Interest saved</Text>
                <Text style={[type.h3, tabularNums, { color: tokens.colors.income, marginTop: space.s1 }]}>
                  {money.whole(projection.interestSaved)}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card title="What you owe over time">
          <AreaChart
            variant="overlay"
            rest="start"
            series={charts.balances}
            xTicks={charts.balanceTicks}
            formatAxis={money.axis}
            heading={(i) => (i === 0 ? 'Today' : `After ${formatDuration(i)}`)}
            readout={balanceReadout}
            summary={`Mortgage balance over ${formatDuration(monthsLeft)}, falling from ${money.whole(balance)} to nothing.${
              withExtra ? ` With ${money.whole(extra)} extra a month it is paid off ${formatDuration(projection.monthsSaved)} sooner.` : ''
            }`}
          />
        </Card>

        <Card title="Where each year’s payments go">
          <BarChart
            series={charts.yearly}
            xTicks={charts.yearlyTicks}
            formatAxis={money.axis}
            heading={(i) => `Year ${i + 1}`}
            readout={yearReadout}
            summary={`What you pay each year, split between principal and interest. In year 1, ${money.whole(plan.yearly[0].interest)} of ${money.whole(plan.yearly[0].principal + plan.yearly[0].interest)} is interest.`}
          />
        </Card>

        <YearTable
          title="Year by year"
          caption="What each year’s payments cover, and what you still owe at its end."
          columns={['Year', 'Principal', 'Interest', 'Owed']}
          rows={plan.yearly.map((y) => [`${y.year}`, money.whole(y.principal), money.whole(y.interest), money.whole(y.balance)])}
        />

        <Text style={[type.caption, { color: tokens.colors.textMuted, marginHorizontal: space.s2 }]}>
          Assumes a fixed rate, monthly payments and monthly interest. Your lender’s figures may differ slightly.
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
      title="Mortgage"
      intro="Work out the monthly payment and see what extra payments would save."
      inputs={inputs}
      results={results}
    />
  );
}
