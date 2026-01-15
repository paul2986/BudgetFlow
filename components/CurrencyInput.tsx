
import React, { useState, useEffect, useRef } from 'react';
import { TextInput, View, Text, TextInputProps } from 'react-native';
import { useCurrency } from '../hooks/useCurrency';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useTheme } from '../hooks/useTheme';

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
  const { themedStyles } = useThemedStyles();
  const { currentColors } = useTheme();
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

  return (
    <View style={containerStyle}>
      {showLabel && label && (
        <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>
          {label}
        </Text>
      )}
      
      <TextInput
        ref={inputRef}
        style={[
          themedStyles.input,
          {
            fontSize: 16,
            fontWeight: '500',
            lineHeight: 20,
            textAlignVertical: 'center',
            includeFontPadding: false,
          },
          error ? { borderColor: currentColors.error } : null,
          inputStyle,
        ]}
        value={displayValue}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={currentColors.textSecondary}
        keyboardType="decimal-pad"
        editable={editable}
        {...props}
      />
      
      {error && (
        <Text style={[
          themedStyles.textSecondary, 
          { 
            color: currentColors.error, 
            marginTop: 4,
            fontSize: 12,
          }
        ]}>
          {error}
        </Text>
      )}
    </View>
  );
}
