
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from './Icon';

// Helper function to detect iPad
const isIPad = () => {
  const { width, height } = Dimensions.get('window');
  const aspectRatio = height / width;

  // iPad detection: larger screen + typical iPad aspect ratios
  return Platform.OS === 'ios' && Math.min(width, height) >= 768 && (
    (aspectRatio > 1.2 && aspectRatio < 1.4) || // Portrait iPad
    (aspectRatio > 0.7 && aspectRatio < 0.85)   // Landscape iPad
  );
};

interface HeaderButton {
  icon: string;
  onPress: () => void;
  backgroundColor?: string;
  iconColor?: string;
}

interface StandardHeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: string;
  rightIcon?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  loading?: boolean;
  rightIconColor?: string;
  leftIconColor?: string;
  showRightIcon?: boolean;
  showLeftIcon?: boolean;
  rightButtons?: HeaderButton[]; // Optional multiple right buttons
  leftButtons?: HeaderButton[]; // Optional multiple left buttons
  backgroundColor?: string; // Optional custom background color
}

export default function StandardHeader({
  title,
  subtitle,
  leftIcon = 'arrow-back',
  rightIcon = 'add',
  onLeftPress,
  onRightPress,
  loading = false,
  rightIconColor,
  leftIconColor,
  showRightIcon = true,
  showLeftIcon = true,
  rightButtons,
  leftButtons,
  backgroundColor,
}: StandardHeaderProps) {
  const { currentColors } = useTheme();
  const { themedStyles } = useThemedStyles();
  const isPad = isIPad();

  // Standardized button styling
  const buttonSize = isPad ? 52 : 44;
  const buttonGap = isPad ? 12 : 8;
  const iconSize = isPad ? 26 : 22;

  const getButtonStyle = (type: 'left' | 'right', isActive?: boolean, customBg?: string) => {
    let backgroundColor = customBg;

    if (!backgroundColor) {
      if (type === 'left') {
        backgroundColor = currentColors.backgroundAlt;
      } else {
        backgroundColor = currentColors.primary;
      }
    }

    return {
      width: buttonSize,
      height: buttonSize,
      borderRadius: buttonSize / 2,
      backgroundColor,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      boxShadow: '0px 2px 4px rgba(0,0,0,0.15)',
      borderWidth: 1,
      borderColor: type === 'left' ? currentColors.border : 'transparent',
    };
  };

  const getIconColor = (type: 'left' | 'right', customColor?: string) => {
    if (customColor) return customColor;
    return type === 'left' ? currentColors.text : '#FFFFFF';
  };

  const renderHeaderButton = (btn: { icon: string, onPress: () => void, backgroundColor?: string, iconColor?: string }, type: 'left' | 'right', idx: number) => {
    const isPrimary = type === 'right';
    const brandGradient = (currentColors as any).brandGradient || ['#7C3AED', '#2563EB', '#0891B2'];

    const containerStyle = {
      width: buttonSize,
      height: buttonSize,
      borderRadius: buttonSize / 2,
      backgroundColor: btn.backgroundColor || (type === 'left' ? currentColors.backgroundAlt : (isPrimary ? 'transparent' : currentColors.primary)),
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      boxShadow: '0px 2px 8px rgba(0,0,0,0.15)',
      borderWidth: 1,
      borderColor: type === 'left' ? currentColors.border : 'transparent',
      marginLeft: type === 'right' && idx > 0 ? buttonGap : 0,
      marginRight: type === 'left' && idx < ((leftButtons?.length || 0) - 1) ? buttonGap : 0,
      overflow: 'hidden' as const,
    };

    const content = (
      <>
        {loading ? (
          <ActivityIndicator size="small" color={getIconColor(type, btn.iconColor)} />
        ) : (
          <Icon
            name={btn.icon as any}
            size={iconSize}
            style={{ color: getIconColor(type, btn.iconColor) }}
          />
        )}
      </>
    );

    return (
      <TouchableOpacity
        key={`${type}_btn_${idx}`}
        onPress={btn.onPress}
        disabled={loading}
        style={containerStyle}
        activeOpacity={0.7}
      >
        {isPrimary && !btn.backgroundColor ? (
          <LinearGradient
            colors={brandGradient as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
          >
            {content}
          </LinearGradient>
        ) : (
          content
        )}
      </TouchableOpacity>
    );
  };

  // Calculate the width needed for left and right button areas to ensure title centering
  const leftButtonsCount = leftButtons?.length || (showLeftIcon && onLeftPress ? 1 : 0);
  const rightButtonsCount = rightButtons?.length || (showRightIcon && onRightPress ? 1 : 0);

  // Each button is buttonSize wide with buttonGap margin between them
  const leftButtonsWidth = leftButtonsCount > 0 ? (leftButtonsCount * buttonSize) + ((leftButtonsCount - 1) * buttonGap) : buttonSize;
  const rightButtonsWidth = rightButtonsCount > 0 ? (rightButtonsCount * buttonSize) + ((rightButtonsCount - 1) * buttonGap) : buttonSize;

  // Use the larger of the two widths to ensure symmetry
  const sideWidth = Math.max(leftButtonsWidth, rightButtonsWidth);

  return (
    <View style={[
      themedStyles.header,
      {
        height: subtitle ? (isPad ? 88 : 76) : (isPad ? 72 : 64),
        boxShadow: '0px 1px 2px rgba(0,0,0,0.10)',
        backgroundColor: backgroundColor || currentColors.backgroundAlt
      }
    ]}>
      {/* Left side - supports multiple left buttons */}
      <View style={{ width: sideWidth, height: buttonSize, justifyContent: 'center', alignItems: 'flex-start', flexDirection: 'row' }}>
        {leftButtons && leftButtons.length > 0 ? (
          leftButtons.map((btn, idx) => renderHeaderButton(btn, 'left', idx))
        ) : showLeftIcon && onLeftPress ? (
          renderHeaderButton({ icon: leftIcon, onPress: onLeftPress, iconColor: leftIconColor }, 'left', 0)
        ) : null}
      </View>

      {/* Center title + optional subtitle - now properly centered */}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={[themedStyles.headerTitle, { textAlign: 'center', lineHeight: isPad ? 28 : 22 }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[themedStyles.textSecondary, { marginTop: 2, fontSize: isPad ? 14 : 12 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Right side - supports multiple header buttons */}
      <View style={{ width: sideWidth, height: buttonSize, justifyContent: 'center', alignItems: 'flex-end', flexDirection: 'row' }}>
        {rightButtons && rightButtons.length > 0 ? (
          rightButtons.map((btn, idx) => renderHeaderButton(btn, 'right', idx))
        ) : showRightIcon && onRightPress ? (
          renderHeaderButton({ icon: rightIcon, onPress: onRightPress, iconColor: rightIconColor }, 'right', 0)
        ) : null}
      </View>
    </View>
  );
}
