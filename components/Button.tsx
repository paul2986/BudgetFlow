import React, { useState } from 'react';
import { Text, Pressable, StyleSheet, ViewStyle, TextStyle, View, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
        gradient: null,
      };
    }

    const brandGradient = (currentColors as any).brandGradient || ['#7C3AED', '#2563EB', '#0891B2'];

    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          textColor: '#FFFFFF',
          gradient: brandGradient,
        };
      case 'secondary':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          textColor: '#FFFFFF',
          // Subtler blue-focused gradient for secondary
          gradient: [brandGradient[1], brandGradient[2]],
        };
      case 'outline':
        return {
          backgroundColor: hovered ? currentColors.primary + '15' : 'transparent',
          borderColor: currentColors.primary,
          textColor: currentColors.primary,
          gradient: null,
        };
      case 'danger':
        return {
          backgroundColor: hovered ? currentColors.error + 'E6' : currentColors.error,
          borderColor: hovered ? currentColors.error + 'E6' : currentColors.error,
          textColor: '#FFFFFF',
          gradient: null,
        };
      default:
        return {
          backgroundColor: currentColors.primary,
          borderColor: currentColors.primary,
          textColor: '#FFFFFF',
          gradient: null,
        };
    }
  };

  const buttonColors = getButtonColors();

  const renderContent = () => (
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
  );

  const isGradientVariant = variant === 'primary' || variant === 'secondary';

  return (
    <View style={[
      style,
      {
        borderRadius: 12,
        overflow: 'visible',
        // Multi-color drop-shadow for true gradient glow on web
        ...(Platform.OS === 'web' && isGradientVariant && !disabled && !loading ? {
          filter: `drop-shadow(0 4px 6px ${buttonColors.gradient?.[0]}40) drop-shadow(0 4px 10px ${buttonColors.gradient?.[buttonColors.gradient.length - 1]}30)`,
        } : {}),
      }
    ]}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: isGradientVariant ? 'transparent' : buttonColors.backgroundColor,
            borderColor: isGradientVariant ? 'transparent' : buttonColors.borderColor,
            borderWidth: isGradientVariant ? 0 : 2,
            paddingVertical: isGradientVariant ? 0 : 16,
            paddingHorizontal: isGradientVariant ? 0 : 24,
            opacity: (disabled || loading) ? 0.6 : (pressed ? 0.9 : 1),
            // Add scale and modern glow on hover for desktop
            transform: Platform.OS === 'web' && hovered && !disabled && !loading ? [{ scale: 1.02 }, { translateY: -2 }] : [],
            // Native shadow
            shadowColor: (isGradientVariant && !disabled && !loading) ? (buttonColors.gradient?.[0] || currentColors.primary) : '#000',
            shadowOpacity: (isGradientVariant && !disabled && !loading) ? 0.3 : 0.05,
            shadowRadius: (isGradientVariant && !disabled && !loading) ? 12 : 4,
            shadowOffset: { width: 0, height: 4 },
          },
        ]}
        onPress={onPress}
        disabled={disabled || loading}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={buttonText}
      >
        {isGradientVariant && !disabled && !loading && buttonColors.gradient ? (
          <LinearGradient
            colors={buttonColors.gradient as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gradient, styles.buttonPadding]}
          >
            {renderContent()}
          </LinearGradient>
        ) : (
          renderContent()
        )}
      </Pressable>
    </View>
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
  gradient: {
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPadding: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
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
