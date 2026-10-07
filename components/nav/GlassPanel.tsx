import { View, Platform, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../../hooks/useTheme';
import { elevation } from '../../styles/tokens';

/**
 * The floating-chrome material shared by the tab bar and the sidebar.
 * - iOS 26+: Liquid Glass. Older iOS: `chrome` blur. Web: `chrome` fill plus
 *   CSS backdrop blur. Android: opaque raised surface.
 * - Hairline `borderStrong` edge; `e2` shadow in light mode only (dark mode
 *   separates by surface and hairline).
 * `fill` stretches the iOS blur layer to the panel's height, for panels sized
 * by their parent (the sidebar) rather than by their content (the tab bar).
 */

// Checked once: availability is fixed for the lifetime of the process.
const USE_LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

interface GlassPanelProps {
  borderRadius: number;
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export default function GlassPanel({ borderRadius, fill, style, children }: GlassPanelProps) {
  const { tokens, isDarkMode } = useTheme();

  if (USE_LIQUID_GLASS) {
    // Glass draws its own edge highlight and depth, so no hairline or
    // shadow. colorScheme follows the in-app theme, not the system.
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={isDarkMode ? 'dark' : 'light'}
        style={[{ borderRadius }, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: tokens.colors.borderStrong,
          overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
          backgroundColor:
            Platform.OS === 'android'
              ? tokens.colors.surfaceRaised
              : Platform.OS === 'ios'
                ? 'transparent' // BlurView supplies the material
                : tokens.colors.chrome,
          // @ts-ignore web blur
          ...(Platform.OS === 'web'
            ? { backdropFilter: 'blur(12px) saturate(160%)', WebkitBackdropFilter: 'blur(12px) saturate(160%)' }
            : {}),
        },
        isDarkMode ? null : elevation.e2,
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={60}
          tint={isDarkMode ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={fill ? { flex: 1 } : undefined}
        >
          {children}
        </BlurView>
      ) : (
        children
      )}
    </View>
  );
}
