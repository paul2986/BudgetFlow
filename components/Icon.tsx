
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface IconProps {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  style?: any;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function Icon({ name, size = 24, color, style }: IconProps) {
  const { tokens } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons
        name={name}
        size={size}
        color={color || style?.color || tokens.colors.text}
        style={style}
      />
    </View>
  );
}
