import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from '../Icon';
import { Card } from '../ui';
import { useTheme } from '../../hooks/useTheme';
import { type, space, tabularNums } from '../../styles/tokens';

/**
 * The chart's table twin: every year's figures as text, collapsed by default.
 * Cells arrive pre-formatted; the first column is the year, the rest are
 * right-aligned amounts.
 */

interface YearTableProps {
  title: string;
  /** One line under the title, e.g. whether the figures are running totals. */
  caption?: string;
  columns: string[];
  rows: string[][];
}

export default function YearTable({ title, caption, columns, rows }: YearTableProps) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const flexFor = (i: number) => (i === 0 ? 0.55 : 1);

  return (
    <Card>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${open ? 'hide' : 'show'} table`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}
      >
        <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text }]}>
          {title}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={tokens.colors.textMuted} />
      </Pressable>

      {open ? (
        <View style={{ marginTop: space.s2 }}>
          {caption ? (
            <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s3 }]}>{caption}</Text>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              paddingBottom: space.s2,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: tokens.colors.borderStrong,
            }}
          >
            {columns.map((c, i) => (
              <Text
                key={c}
                style={[type.caption, { flex: flexFor(i), color: tokens.colors.textMuted, textAlign: i === 0 ? 'left' : 'right' }]}
              >
                {c}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View
              key={row[0]}
              style={{
                flexDirection: 'row',
                paddingVertical: space.s2,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: tokens.colors.border,
              }}
            >
              {row.map((cell, i) => (
                <Text
                  key={i}
                  style={[type.caption, tabularNums, { flex: flexFor(i), color: tokens.colors.text, textAlign: i === 0 ? 'left' : 'right' }]}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
