
import React, { useState, useEffect, useRef } from 'react';
import { TextInput, View, Text, TextInputProps, Platform } from 'react-native';
import { useCurrency } from '../hooks/useCurrency';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';
import { type, space, radius, tabularNums, font } from '../styles/tokens';

interface CurrencyInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  error?: string;
  showLabel?: boolean;
  containerStyle?: any;
  inputStyle?: any;
}

export default function CurrencyInput({
  value,
  onChangeText,
  label,
  error,
  showLabel = true,
  containerStyle,
  inputStyle,
  placeholder = "0.00",
  editable = true,
  onBlur,
  ...props
}: CurrencyInputProps) {
  const { tokens } = useTheme();
  const { currency } = useCurrency();
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  const parseNumericValue = (text: string): number | null => {
    if (!text || text.trim() === '') return null;
    const cleaned = text.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  useEffect(() => {
    const numericValue = parseNumericValue(value);
    
    if (isFocused) {
      setDisplayValue(value);
    } else {
      if (numericValue === null || numericValue === 0) {
        setDisplayValue('');
      } else {
        setDisplayValue(numericValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }));
      }
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setDisplayValue(value);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    let cleanedValue = parts[0];
    if (parts.length > 1) {
      const decimalPart = parts[1].substring(0, 2);
      cleanedValue += '.' + decimalPart;
    }
    
    const numericValue = parseFloat(cleanedValue);
    
    if (!isNaN(numericValue) && numericValue > 0) {
      const roundedValue = Math.round(numericValue * 100) / 100;
      onChangeText(roundedValue.toString());
      setDisplayValue(roundedValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }));
    } else if (cleaned === '' || numericValue === 0) {
      onChangeText('');
      setDisplayValue('');
    }
    
    if (onBlur) {
      onBlur(e);
    }
  };

  const handleChangeText = (text: string) => {
    if (isFocused) {
      const cleaned = text.replace(/[^0-9.]/g, '');
      const parts = cleaned.split('.');
      let finalValue = parts[0];
      if (parts.length > 1) {
        const decimalPart = parts[1].substring(0, 2);
        finalValue += '.' + decimalPart;
      }
      
      setDisplayValue(finalValue);
      onChangeText(finalValue);
    }
  };

  const webRing =
    Platform.OS === 'web' && isFocused
      ? ({ outlineWidth: 2, outlineStyle: 'solid', outlineColor: error ? tokens.colors.danger : tokens.colors.brand, outlineOffset: -1 } as any)
      : null;

  // Matches ui/Input: caption label above, sunken field with the currency
  // symbol as a leading affix, one focus ring on the container.
  return (
    <View style={containerStyle}>
      {showLabel && label ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>{label}</Text>
      ) : null}

      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 48,
            paddingHorizontal: space.s4,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: error ? tokens.colors.danger : isFocused ? tokens.colors.brand : tokens.colors.borderStrong,
            backgroundColor: tokens.colors.surfaceSunken,
          },
          webRing,
        ]}
      >
        <Text style={[type.bodyMed, { color: tokens.colors.textMuted, marginRight: space.s2 }]}>{currency.symbol}</Text>
        <TextInput
          ref={inputRef}
          style={[
            // No lineHeight (same as ui/Input): on a native TextInput it
            // offsets the text vertically, so the value sat below the symbol.
            { fontSize: type.bodyMed.fontSize, letterSpacing: type.bodyMed.letterSpacing, ...font(500) },
            tabularNums,
            {
              flex: 1,
              color: tokens.colors.text,
              paddingVertical: space.s3,
              ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
            },
            inputStyle,
          ]}
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={tokens.colors.textFaint}
          keyboardType="decimal-pad"
          editable={editable}
          accessibilityLabel={label}
          {...props}
        />
      </View>

      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.s1 }}>
          <Icon name="alert-circle" size={14} color={tokens.colors.danger} style={{ marginRight: space.s1 }} />
          <Text style={[type.caption, { color: tokens.colors.danger, flex: 1 }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
