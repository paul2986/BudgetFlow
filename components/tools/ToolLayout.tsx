import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import StandardHeader from '../StandardHeader';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useTheme } from '../../hooks/useTheme';
import { type, space } from '../../styles/tokens';

/**
 * Page shell shared by the calculators: back-button header, a one-line intro,
 * and inputs beside results on wide screens (stacked on a phone).
 */

interface ToolLayoutProps {
  title: string;
  intro: string;
  inputs: React.ReactNode;
  results: React.ReactNode;
}

export default function ToolLayout({ title, intro, inputs, results }: ToolLayoutProps) {
  const { themedStyles, breakpoint } = useThemedStyles();
  const { tokens } = useTheme();
  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/tools'));

  return (
    <View style={themedStyles.container}>
      <StandardHeader title={title} onLeftPress={goBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: breakpoint.contentMaxWidth, alignSelf: 'center' }}>
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s4 }]}>{intro}</Text>
          <View
            style={{
              flexDirection: breakpoint.isExpanded ? 'row' : 'column',
              alignItems: breakpoint.isExpanded ? 'flex-start' : 'stretch',
              gap: space.s6,
            }}
          >
            <View style={breakpoint.isExpanded ? { flex: 1 } : undefined}>{inputs}</View>
            <View style={breakpoint.isExpanded ? { flex: 1.2 } : undefined}>{results}</View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
