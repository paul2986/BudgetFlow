import { useState, useMemo, useEffect } from 'react';
import { LAYOUT } from '../hooks/useBreakpoint';
import { View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useCurrency, CURRENCIES, Currency, displaySymbol } from '../hooks/useCurrency';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useFormSessionKey } from '../hooks/useFormSessionKey';
import StandardHeader from '../components/StandardHeader';
import Icon from '../components/Icon';
import { EmptyState, FormScreen, ListGroup, ListRow, SearchField, useFormInsets } from '../components/ui';
import { space } from '../styles/tokens';

/** Currency picker, pushed from Settings like Budgets and Categories. */
export default function CurrencyScreen() {
  const { tokens } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const { themedStyles, breakpoint } = useThemedStyles();
  const formInsets = useFormInsets();
  const [query, setQuery] = useState('');
  // Clear the search once the screen has slid away, not mid-slide.
  const session = useFormSessionKey();
  useEffect(() => setQuery(''), [session]);

  const filteredCurrencies = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
    );
  }, [query]);

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/settings'));

  // The checkmark moving is the confirmation; no toast needed.
  const handleSelect = (curr: Currency) => {
    setCurrency(curr);
    goBack();
  };

  return (
    <View style={themedStyles.formContainer}>
      <FormScreen>
        <StandardHeader title="Currency" onLeftPress={goBack} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={
            breakpoint.isCompact
              ? [themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]
              : formInsets
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: '100%', maxWidth: LAYOUT.listMaxWidth, alignSelf: 'center' }}>
            <View style={{ marginBottom: space.s4 }}>
              <SearchField value={query} onChangeText={setQuery} placeholder="Search currencies" />
            </View>
            {filteredCurrencies.length === 0 ? (
              <EmptyState icon="search-outline" title="No currencies found" caption="Try a name, code or symbol." />
            ) : (
              <ListGroup>
                {filteredCurrencies.map((curr, i) => {
                  const selected = curr.code === currency.code;
                  return (
                    <ListRow
                      key={curr.code}
                      title={curr.name}
                      caption={`${displaySymbol(curr.symbol)} · ${curr.code}`}
                      trailing={selected ? <Icon name="checkmark" size={20} color={tokens.colors.brand} /> : undefined}
                      onPress={() => handleSelect(curr)}
                      accessibilityLabel={`${curr.name}${selected ? ', selected' : ''}`}
                      showSeparator={i < filteredCurrencies.length - 1}
                    />
                  );
                })}
              </ListGroup>
            )}
          </View>
        </ScrollView>
      </FormScreen>
    </View>
  );
}
