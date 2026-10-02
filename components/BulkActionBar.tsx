import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Button from './Button';
import { type, space, radius, elevation } from '../styles/tokens';

/**
 * The table's selection bar: floats at the bottom of the screen once a row is
 * ticked, and follows the scroll (sticky on web). It sits after the table, so
 * it appearing never shifts the rows being ticked. The phone has no such bar;
 * its header carries Edit and Delete in selection mode.
 */

interface BulkActionBarProps {
  count: number;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export default function BulkActionBar({ count, disabled, onEdit, onDelete, onClear }: BulkActionBarProps) {
  const { tokens } = useTheme();
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Bulk actions"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s3,
          paddingHorizontal: space.s4,
          paddingVertical: space.s2,
          marginTop: space.s3,
          borderRadius: radius.lg,
          backgroundColor: tokens.colors.surfaceRaised,
          borderWidth: tokens.isDark ? 1 : 0,
          borderColor: tokens.colors.border,
          ...elevation.e3,
        },
        // Opaque and above the rows, so the table scrolls beneath it.
        Platform.OS === 'web' ? ({ position: 'sticky', bottom: space.s4, zIndex: 5 } as any) : null,
      ]}
    >
      <Text
        accessibilityLiveRegion="polite"
        style={[type.bodyMed, { flex: 1, color: tokens.colors.text }]}
      >
        {count} selected
      </Text>
      <View style={{ minWidth: 80 }}>
        <Button text="Clear" onPress={onClear} variant="ghost" disabled={disabled} />
      </View>
      <View style={{ minWidth: 96 }}>
        <Button
          text="Delete"
          onPress={onDelete}
          variant="outline"
          disabled={disabled}
          textStyle={{ color: tokens.colors.danger }}
        />
      </View>
      <View style={{ minWidth: 96 }}>
        <Button text="Edit" onPress={onEdit} disabled={disabled} />
      </View>
    </View>
  );
}
