import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { font, radius } from '../../styles/tokens';

/**
 * Avatar per DESIGN.md §2.8: initial on a deterministic per-person hue from a
 * fixed accessible 8-hue set.
 */

const LIGHT_HUES: { bg: string; fg: string }[] = [
  { bg: '#EEF2FF', fg: '#3730A3' }, // indigo
  { bg: '#ECFEFF', fg: '#155E75' }, // cyan
  { bg: '#FFFBEB', fg: '#92400E' }, // amber
  { bg: '#FFF1F2', fg: '#9F1239' }, // rose
  { bg: '#ECFDF5', fg: '#065F46' }, // emerald
  { bg: '#F5F3FF', fg: '#5B21B6' }, // violet
  { bg: '#FFF7ED', fg: '#9A3412' }, // orange
  { bg: '#F0F9FF', fg: '#075985' }, // sky
];

const DARK_HUES: { bg: string; fg: string }[] = [
  { bg: '#312E8166', fg: '#C7D2FE' },
  { bg: '#164E6366', fg: '#A5F3FC' },
  { bg: '#78350F66', fg: '#FDE68A' },
  { bg: '#88133766', fg: '#FECDD3' },
  { bg: '#064E3B66', fg: '#A7F3D0' },
  { bg: '#4C1D9566', fg: '#DDD6FE' },
  { bg: '#7C2D1266', fg: '#FED7AA' },
  { bg: '#0C4A6E66', fg: '#BAE6FD' },
];

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
  const hues = tokens.isDark ? DARK_HUES : LIGHT_HUES;
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
