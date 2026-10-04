import React from 'react';
import { View, Text, Animated } from 'react-native';
import { router } from 'expo-router';
import StandardHeader, { LargeTitle } from '../../components/StandardHeader';
import Icon from '../../components/Icon';
import { Card } from '../../components/ui';
import { useLargeTitle } from '../../hooks/useLargeTitle';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { isUkCurrency } from '../../utils/debtHelp';
import { type, space, radius } from '../../styles/tokens';

/**
 * Tools hub (DESIGN.md §2.7): a card per tool (icon, name, one line),
 * each opening its own screen so it can be linked to and backed out of.
 */

type ToolTone = 'creditCard' | 'income' | 'mortgage' | 'brand' | 'neutral';

interface ToolEntry {
  route: '/tools/credit-card' | '/tools/savings' | '/tools/mortgage' | '/tools/budget-review' | '/tools/debt-help';
  title: string;
  caption: string;
  icon: string;
  /** Reuses the app's own accents: credit card pink, savings income green, mortgage purple, budget review brand indigo; debt help is neutral, since it's help, not a debt or a status. */
  tone: ToolTone;
  /** Shown only to UK users (currency is pounds). */
  ukOnly?: boolean;
}

const TOOLS: ToolEntry[] = [
  {
    route: '/tools/credit-card',
    title: 'Credit card payoff',
    caption: 'See how long a balance takes to clear and how much interest it costs.',
    icon: 'card-outline',
    tone: 'creditCard',
  },
  {
    route: '/tools/savings',
    title: 'Savings growth',
    caption: 'Project how regular deposits and interest build up over the years.',
    icon: 'trending-up-outline',
    tone: 'income',
  },
  {
    route: '/tools/mortgage',
    title: 'Mortgage',
    caption: 'Work out the monthly payment and see what extra payments would save.',
    icon: 'home-outline',
    tone: 'mortgage',
  },
  {
    route: '/tools/budget-review',
    title: 'Budget review',
    caption: 'Compare your budget with the 50/30/20 rule for needs, wants and savings.',
    icon: 'pie-chart-outline',
    tone: 'brand',
  },
  {
    route: '/tools/debt-help',
    title: 'Debt help',
    caption: 'Free, impartial debt advice in the UK, by phone, web chat or online.',
    icon: 'help-buoy-outline',
    tone: 'neutral',
    ukOnly: true,
  },
];

export default function ToolsHubScreen() {
  const { themedStyles, breakpoint } = useThemedStyles();
  const { tokens } = useTheme();
  const largeTitle = useLargeTitle();
  const { currency, loading: currencyLoading } = useCurrency();

  const tools = TOOLS.filter((tool) => !tool.ukOnly || (!currencyLoading && isUkCurrency(currency.code)));
  const columns = breakpoint.isExpanded ? 3 : breakpoint.isMedium ? 2 : 1;
  const rows: ToolEntry[][] = [];
  for (let i = 0; i < tools.length; i += columns) rows.push(tools.slice(i, i + columns));

  const accent = (tone: ToolTone) =>
    tone === 'neutral'
      ? { color: tokens.colors.textMuted, background: tokens.colors.surfaceSunken }
      : { color: tokens.colors[tone], background: tokens.colors[`${tone}Subtle` as const] };

  return (
    <View style={themedStyles.container}>
      <StandardHeader title="Tools" largeTitle={largeTitle} showLeftIcon={false} showRightIcon={false} />
      <Animated.ScrollView
        {...largeTitle.scrollProps}
        contentContainerStyle={[
          themedStyles.scrollContent,
          { paddingHorizontal: breakpoint.gutter, paddingTop: largeTitle.enabled ? 0 : space.s6 },
        ]}
      >
        <View style={{ width: '100%', maxWidth: breakpoint.contentMaxWidth, alignSelf: 'center' }}>
          <LargeTitle largeTitle={largeTitle} />
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s4 }]}>
            Calculators and a budget check for the big numbers: what a debt costs, what savings can become and how your spending compares.
          </Text>

          <View style={{ gap: space.s4 }}>
            {rows.map((row) => (
              <View key={row[0].route} style={{ flexDirection: 'row', gap: space.s4 }}>
                {row.map((tool) => {
                  const { color, background } = accent(tool.tone);
                  return (
                    <View key={tool.route} style={{ flex: 1 }}>
                      <Card
                        onPress={() => router.navigate(tool.route)}
                        accessibilityLabel={`${tool.title}. ${tool.caption}`}
                        style={{ minHeight: 136 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: radius.full,
                              backgroundColor: background,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon name={tool.icon as any} size={22} color={color} />
                          </View>
                          <Icon name="chevron-forward" size={18} color={tokens.colors.textFaint} />
                        </View>
                        <Text style={[type.h3, { color: tokens.colors.text, marginTop: space.s3 }]}>{tool.title}</Text>
                        <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]}>
                          {tool.caption}
                        </Text>
                      </Card>
                    </View>
                  );
                })}
                {/* Keeps a short last row's cards the same width as the rows above. */}
                {Array.from({ length: columns - row.length }).map((_, i) => (
                  <View key={`spacer${i}`} style={{ flex: 1 }} />
                ))}
              </View>
            ))}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}
