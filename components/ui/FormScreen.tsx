import React, { createContext } from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useBreakpoint, LAYOUT } from '../../hooks/useBreakpoint';
import { radius, space, elevation } from '../../styles/tokens';

/**
 * Route-hosted form container (DESIGN.md §2.5 unified add/edit pattern).
 * Full-width on compact; centered dialog-like card on medium/expanded.
 * Because it's a route (not an overlay), every form is deep-linkable and the
 * browser back button behaves identically on all platforms.
 */

/** True inside the medium+ form card, where a page-size title would overpower the dialog. */
export const FormCardContext = createContext(false);

interface FormScreenProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export default function FormScreen({ children, style }: FormScreenProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();

  if (bp.isCompact) {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  return (
    <View style={[{ flex: 1, alignItems: 'center', paddingTop: space.s7, paddingHorizontal: bp.gutter }, style]}>
      <View
        style={{
          width: '100%',
          maxWidth: LAYOUT.formMaxWidth[bp.breakpoint] ?? 600,
          flex: 1,
          backgroundColor: tokens.colors.surface,
          borderRadius: radius.xl,
          overflow: 'hidden',
          marginBottom: space.s7,
          // Fill, not stroke: soft lift in light mode, stepped surface in dark.
          ...(tokens.isDark ? { backgroundColor: tokens.colors.surfaceRaised } : elevation.e2),
        }}
      >
        <FormCardContext.Provider value={true}>{children}</FormCardContext.Provider>
      </View>
    </View>
  );
}
