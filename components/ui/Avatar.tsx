import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { font, radius, lightAvatarHues, darkAvatarHues } from '../../styles/tokens';

/**
 * Avatar per DESIGN.md §2.8: initial on a deterministic per-person hue from
 * the accessible avatar hue set in styles/tokens.ts.
 */

const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

interface AvatarProps {
  name: string;
  /** Stable key for hue selection (person id); falls back to name. */
  seed?: string;
  size?: 28 | 36 | 44;
}

export default function Avatar({ name, seed, size = 36 }: AvatarProps) {
  const { tokens } = useTheme();
  const hues = tokens.isDark ? darkAvatarHues : lightAvatarHues;
  const hue = hues[hashString(seed || name) % hues.length];
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      accessibilityElementsHidden // decorative; the adjacent name text carries meaning
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: hue.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ ...font(600), fontSize: size * 0.44, color: hue.fg }}>{initial}</Text>
    </View>
  );
}
