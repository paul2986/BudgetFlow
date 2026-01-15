
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { colors } from '../styles/commonStyles';
import { useTheme } from '../hooks/useTheme';

interface IconProps {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  style?: any;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function Icon({ name, size = 24, style }: IconProps) {
  const { currentColors } = useTheme();
  
  return (
    <View style={styles.container}>
      <Ionicons
        name={name}
        size={size}
        color={style?.color || currentColors.text}
        style={style}
      />
    </View>
  );
}
