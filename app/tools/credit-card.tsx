
import { useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import StandardHeader from '../../components/StandardHeader';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import Icon from '../../components/Icon';
import Button from '../../components/Button';
import CurrencyInput from '../../components/CurrencyInput';
import * as Clipboard from 'expo-clipboard';
import { computeCreditCardPayoff, computeInterestOnlyMinimum } from '../../utils/calculations';
import { CreditCardPayoffResult } from '../../types/budget';
import { useToast } from '../../hooks/useToast';
import { AmountText, Card, EmptyState, Input } from '../../components/ui';
import { formatDuration } from '../../utils/formatDuration';
import { cleanDecimal, parseAmount } from '../../utils/numberInput';
import { type, space, radius, tabularNums } from '../../styles/tokens';

export default function CreditCardPayoffScreen() {
  const { themedStyles, breakpoint } = useThemedStyles();
  const { tokens } = useTheme();
  const { formatCurrency, currency } = useCurrency();
  const { showToast } = useToast();

  const [balanceInput, setBalanceInput] = useState<string>('');
  const [aprInput, setAprInput] = useState<string>('');
  const [paymentInput, setPaymentInput] = useState<string>('');

  const [errors, setErrors] = useState<{ balance?: string; apr?: string; payment?: string }>({});
  const [result, setResult] = useState<CreditCardPayoffResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Minimum payment suggestion state
  const [suggestedMin, setSuggestedMin] = useState<number | null>(null);

  // The three inputs as numbers (null when empty or not a number). A blank rate is not 0%.
  const balance = parseAmount(balanceInput);
  const apr = aprInput.trim() === '' ? null : parseAmount(aprInput);
  const payment = parseAmount(paymentInput);

  const currencyFractionDigits = useMemo(() => {
    try {
      const nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.code });
      const opts = nf.resolvedOptions();
      return Math.max(0, opts.maximumFractionDigits || 2);
    } catch (e) {
      console.warn('currencyFractionDigits error, defaulting to 2', e);
      return 2;
    }
  }, [currency.code]);

  // Recalculate minimum suggestion when balance or APR changes, but don't auto-fill payment field
  useEffect(() => {
    setSuggestedMin(
      balance !== null && balance > 0 && apr !== null && apr >= 0
        ? computeInterestOnlyMinimum(balance, apr, currencyFractionDigits)
        : null
    );
  }, [balance, apr, currencyFractionDigits]);

  const validate = useCallback(() => {
    const newErrors: { balance?: string; apr?: string; payment?: string } = {};
    if (balance === null || balance <= 0) newErrors.balance = 'Enter a positive balance.';
    if (apr === null || apr < 0) newErrors.apr = 'Enter APR as 0 or a positive percent.';
    if (payment === null || payment < 0) newErrors.payment = 'Enter a positive monthly payment.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [balance, apr, payment]);

  // Enabled purely from the current inputs; stale blur-time errors must not keep
  // the button disabled once the values are valid (handleCalculate re-validates).
  const canCalculate = balance !== null && balance > 0 && apr !== null && apr >= 0 && payment !== null && payment >= 0;

  const onBlurApr = () => {
    if (apr === null || apr < 0) return;
    // Round to 2 decimal places
    setAprInput((Math.round(apr * 100) / 100).toString());
  };

  const handleCalculate = () => {
    if (!validate()) return;

    let r = computeCreditCardPayoff(balance || 0, apr || 0, payment || 0);

    // If the payment is exactly the suggested minimum (rounded to the currency's
    // precision), say the balance is never repaid: the rounding can leave it a hair
    // above the interest, which would otherwise promise a payoff decades away.
    if (suggestedMin !== null && Number((payment || 0).toFixed(currencyFractionDigits)) === Number(suggestedMin.toFixed(currencyFractionDigits))) {
      r = { ...r, neverRepaid: true, months: 0, totalInterest: 0, schedule: [] };
    }

    setResult(r);
    setShowResults(true);
  };

  const handleReset = () => {
    setBalanceInput('');
    setAprInput('');
    setPaymentInput('');
    setErrors({});
    setResult(null);
    setShowResults(false);
    setSuggestedMin(null);
  };

  const copyResultsText = useMemo(() => {
    if (!result) return '';
    if (result.neverRepaid) {
      return `Credit Card Payoff — Never Repaid
Balance: ${formatCurrency(result.inputs.balance)}
APR: ${result.inputs.apr}%
Monthly Payment: ${formatCurrency(result.inputs.monthlyPayment)}
Only covers interest — balance will never be repaid.`;
    }
    const header = `Credit Card Payoff Results
Balance: ${formatCurrency(result.inputs.balance)}
APR: ${result.inputs.apr}%
Monthly Payment: ${formatCurrency(result.inputs.monthlyPayment)}
Months to Payoff: ${result.months}
Total Interest Paid: ${formatCurrency(result.totalInterest)}`;
    const scheduleLines = result.schedule.map((row) => {
      return `Month ${row.month}: Payment ${formatCurrency(row.payment)}, Interest ${formatCurrency(row.interest)}, Principal ${formatCurrency(row.principal)}, Remaining ${formatCurrency(row.remaining)}`;
    });
    return [header, '', 'First 3 Months:', ...scheduleLines].join('\n');
  }, [result, formatCurrency]);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await Clipboard.setStringAsync(copyResultsText);
      showToast('Results copied to clipboard', 'success');
    } catch (e) {
      console.warn('Copy error', e);
      showToast('Failed to copy', 'error');
    }
  };

  const isUsingMin =
    suggestedMin !== null &&
    payment !== null &&
    Number(payment.toFixed(currencyFractionDigits)) === Number(suggestedMin.toFixed(currencyFractionDigits));

  const inputsCard = (
    <Card>
      <View style={{ gap: space.s5 }}>
        <CurrencyInput
          label="Balance"
          value={balanceInput}
          onChangeText={setBalanceInput}
          error={errors.balance}
        />

        <Input
          label="Interest rate (APR %)"
          value={aprInput}
          // Numbers and one decimal point, max 2 decimal places.
          onChangeText={(t) => setAprInput(cleanDecimal(t, 2))}
          onBlur={() => {
            onBlurApr();
            validate();
          }}
          keyboardType="decimal-pad"
          placeholder="e.g. 22.9"
          error={errors.apr}
        />

        <View>
          <CurrencyInput
            label="Monthly payment"
            value={paymentInput}
            onChangeText={(t) => {
              setPaymentInput(t);
              if (errors.payment) {
                const next = { ...errors };
                delete next.payment;
                setErrors(next);
              }
            }}
            onBlur={() => validate()}
            error={errors.payment}
            placeholder="0.00"
          />
          {suggestedMin !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: space.s2, gap: space.s2 }}>
              <Icon
                name={isUsingMin ? 'alert-circle' : 'information-circle-outline'}
                size={16}
                color={isUsingMin ? tokens.colors.warning : tokens.colors.textMuted}
              />
              <Text style={[type.caption, { flex: 1, color: isUsingMin ? tokens.colors.warning : tokens.colors.textMuted }]}>
                {isUsingMin
                  ? 'This only covers interest, so the balance will never go down.'
                  : `Interest this month is about ${formatCurrency(suggestedMin)}. Pay more than that to reduce the balance.`}
              </Text>
            </View>
          ) : null}
        </View>

        <Button text="Calculate" onPress={handleCalculate} disabled={!canCalculate} size="lg" style={{ marginTop: 0 }} />
      </View>
    </Card>
  );

  const resultsCard = () => {
    if (!showResults || !result) {
      return breakpoint.isCompact ? null : (
        <Card>
          <EmptyState
            icon="analytics-outline"
            title="Your payoff plan appears here"
            caption="Enter a balance, interest rate and monthly payment, then calculate."
          />
        </Card>
      );
    }

    return (
      <Card title="Results">
        {result.neverRepaid ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: space.s3,
              padding: space.s4,
              borderRadius: radius.md,
              backgroundColor: tokens.colors.warningSubtle,
            }}
          >
            <Icon name="warning" size={20} color={tokens.colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyMed, { color: tokens.colors.text }]}>This balance won’t be paid off</Text>
              <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]}>
                {formatCurrency(result.inputs.monthlyPayment)} a month only covers the interest. Increase the payment to start
                reducing what you owe.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: space.s4, marginBottom: space.s5 }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Paid off in</Text>
                <Text style={[type.h2, tabularNums, { color: tokens.colors.text, marginTop: space.s1 }]}>
                  {formatDuration(result.months)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Total interest</Text>
                <AmountText value={result.totalInterest} role="h2" tone="expense" style={{ marginTop: space.s1 }} />
              </View>
            </View>

            <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>First 3 months</Text>
            <View
              style={{
                flexDirection: 'row',
                paddingBottom: space.s2,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: tokens.colors.borderStrong,
              }}
            >
              {['Month', 'Interest', 'Principal', 'Left'].map((h, i) => (
                <Text
                  key={h}
                  style={[type.caption, { flex: i === 0 ? 0.6 : 1, color: tokens.colors.textMuted, textAlign: i === 0 ? 'left' : 'right' }]}
                >
                  {h}
                </Text>
              ))}
            </View>
            {result.schedule.map((row) => (
              <View
                key={row.month}
                style={{
                  flexDirection: 'row',
                  paddingVertical: space.s2,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: tokens.colors.border,
                }}
              >
                <Text style={[type.body, tabularNums, { flex: 0.6, color: tokens.colors.text }]}>{row.month}</Text>
                {[row.interest, row.principal, row.remaining].map((v, i) => (
                  <Text key={i} style={[type.body, tabularNums, { flex: 1, textAlign: 'right', color: tokens.colors.text }]}>
                    {formatCurrency(v)}
                  </Text>
                ))}
              </View>
            ))}
          </>
        )}

        <View style={{ flexDirection: 'row', gap: space.s3, marginTop: space.s5 }}>
          <View style={{ flex: 1 }}>
            <Button text="Start over" onPress={handleReset} variant="ghost" style={{ marginTop: 0 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Button text="Copy results" onPress={handleCopy} variant="secondary" style={{ marginTop: 0 }} />
          </View>
        </View>
      </Card>
    );
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/tools'));

  return (
    <View style={themedStyles.container}>
      <StandardHeader title="Credit card payoff" onLeftPress={goBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ width: '100%', maxWidth: breakpoint.contentMaxWidth, alignSelf: 'center' }}>
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s4 }]}>
            See how long a balance takes to clear and how much interest it costs.
          </Text>

          <View
            style={{
              flexDirection: breakpoint.isExpanded ? 'row' : 'column',
              alignItems: breakpoint.isExpanded ? 'flex-start' : 'stretch',
              gap: space.s6,
            }}
          >
            <View style={breakpoint.isExpanded ? { flex: 1 } : undefined}>{inputsCard}</View>
            <View style={breakpoint.isExpanded ? { flex: 1.2 } : undefined}>{resultsCard()}</View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
