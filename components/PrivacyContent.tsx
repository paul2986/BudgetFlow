import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { type, space } from '../styles/tokens';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../utils/privacyText';

/**
 * What Budget Flow stores, who can see it and how to delete it, in plain words.
 * Shown in a sheet from the sign-in screen (so it can be read before an account
 * exists) and as a screen from Settings → Privacy.
 * The words live in utils/privacyText.ts.
 */

export default function PrivacyContent() {
  const { tokens } = useTheme();

  return (
    <View>
      <Text style={[type.body, { color: tokens.colors.textMuted }]}>
        Budget Flow keeps your budgets so you can use them on more than one device and share them with people you choose.
        This page says what is stored, who can see it and how to delete it.
      </Text>
      <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s2 }]}>
        Last updated {PRIVACY_UPDATED}
      </Text>

      {PRIVACY_SECTIONS.map((section) => (
        <View key={section.title} style={{ marginTop: space.s6 }}>
          <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text, marginBottom: space.s2 }]}>
            {section.title}
          </Text>
          {section.lines.map((line) => {
            const bullet = line.startsWith('• ');
            return (
              <View key={line} style={{ flexDirection: 'row', marginTop: space.s2 }}>
                {bullet ? (
                  <Text style={[type.body, { color: tokens.colors.textMuted, width: space.s4 }]} importantForAccessibility="no">
                    •
                  </Text>
                ) : null}
                <Text style={[type.body, { color: tokens.colors.text, flex: 1 }]}>{bullet ? line.slice(2) : line}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
