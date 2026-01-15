import React, { useState } from 'react';
import { Text, Pressable, StyleSheet, ViewStyle, TextStyle, View, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface ButtonProps {
  text?: string;
  title?: string;
  onPress: () => void;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
}

export default function Button({
  text,
  title,
  onPress,
  style,
  textStyle,
  disabled,
  loading,
  icon,
  variant = 'primary'
}: ButtonProps) {
  const { currentColors } = useTheme();
  const [hovered, setHovered] = useState(false);

  const buttonText = text || title || '';

  const getButtonColors = () => {
    if (disabled || loading) {
      return {
        backgroundColor: currentColors.textSecondary + '40',
        borderColor: currentColors.textSecondary + '40',
        textColor: currentColors.textSecondary,
      };
    }

    switch (variant) {
      case 'primary':
        return {
          backgroundColor: hovered ? currentColors.primary + 'E6' : currentColors.primary, // E6 is 90% opacity
          borderColor: hovered ? currentColors.primary + 'E6' : currentColors.primary,
          textColor: '#FFFFFF',
        };
      case 'secondary':
        return {
          backgroundColor: hovered ? currentColors.secondary + 'E6' : currentColors.secondary,
          borderColor: hovered ? currentColors.secondary + 'E6' : currentColors.secondary,
          textColor: '#FFFFFF',
        };
      case 'outline':
        return {
          backgroundColor: hovered ? currentColors.primary + '15' : 'transparent',
          borderColor: currentColors.primary,
          textColor: currentColors.primary,
        };
      case 'danger':
        return {
          backgroundColor: hovered ? currentColors.error + 'E6' : currentColors.error,
          borderColor: hovered ? currentColors.error + 'E6' : currentColors.error,
          textColor: '#FFFFFF',
        };
      default:
        return {
          backgroundColor: currentColors.primary,
          borderColor: currentColors.primary,
          textColor: '#FFFFFF',
        };
    }
  };

  const buttonColors = getButtonColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: buttonColors.backgroundColor,
          borderColor: buttonColors.borderColor,
          opacity: (disabled || loading) ? 0.6 : (pressed ? 0.8 : 1),
          // Add scale on hover for desktop
          transform: Platform.OS === 'web' && hovered && !disabled && !loading ? [{ scale: 1.02 }] : [],
        },
        style
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={buttonText}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={buttonColors.textColor}
            style={buttonText ? styles.loadingWithText : undefined}
          />
        ) : (
          icon && (
            <View style={styles.iconContainer}>
              {icon}
            </View>
          )
        )}
        {buttonText ? (
          <Text
            style={[
              styles.text,
              { color: buttonColors.textColor },
              textStyle
            ]}
          >
            {buttonText}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    /* transition for web */
    transitionDuration: '0.2s',
  } as ViewStyle,
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },
  loadingWithText: {
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: Platform.select({ ios: 'Inter', android: 'sans-serif-bold', web: 'Inter, system-ui, -apple-system, sans-serif' }),
  },
});
