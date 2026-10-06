
import React, { useState, useEffect, useRef, createContext, useContext, useMemo } from 'react';
import { Animated, Platform, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTokens, motion, Tokens } from '../styles/tokens';
import { crossfadeTheme } from '../utils/themeCrossfade';
import { useReducedMotion } from './useReducedMotion';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'app_theme_mode';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDarkMode: boolean;
  /** Design tokens per design/DESIGN.md — the source of truth for redesigned UI. */
  tokens: Tokens;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  setThemeMode: async () => {},
  isDarkMode: false,
  tokens: getTokens(false),
  loading: true,
});

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wrap in async function to handle potential promise rejections
    const initializeTheme = async () => {
      try {
        await loadThemeMode();
      } catch (error) {
        console.error('ThemeProvider: Error initializing theme:', error);
        setLoading(false);
      }
    };
    
    initializeTheme();
  }, []);

  const loadThemeMode = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
        setThemeModeState(savedTheme as ThemeMode);
      }
    } catch (error) {
      console.error('ThemeProvider: Error loading theme mode:', error);
    } finally {
      setLoading(false);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeModeState(mode);
    } catch (error) {
      console.error('ThemeProvider: Error saving theme mode:', error);
      // Still update the state even if storage fails
      setThemeModeState(mode);
    }
  };

  const targetDark = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');
  // The theme on screen trails the target so a switch can fade instead of
  // snapping. Unset until the saved mode has loaded; that first theme applies
  // instantly.
  const [appliedDark, setAppliedDark] = useState<boolean>();
  const isDarkMode = appliedDark ?? targetDark;
  const reducedMotion = useReducedMotion();
  // Native: the old background, covering the switch while it fades out.
  const [veil, setVeil] = useState<string | null>(null);
  const veilOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) return;
    if (appliedDark === undefined || reducedMotion) {
      setAppliedDark(targetDark);
      return;
    }
    if (appliedDark === targetDark) return;
    const animated = crossfadeTheme(() => setAppliedDark(targetDark));
    if (!animated && Platform.OS !== 'web') {
      setVeil(getTokens(appliedDark).colors.bg);
    }
  }, [targetDark, appliedDark, loading, reducedMotion]);

  useEffect(() => {
    if (!veil) return;
    veilOpacity.setValue(1);
    const fade = Animated.timing(veilOpacity, {
      toValue: 0,
      duration: motion.theme,
      useNativeDriver: true,
    });
    fade.start(() => setVeil(null));
    return () => fade.stop();
  }, [veil, veilOpacity]);

  const tokens = useMemo(() => getTokens(isDarkMode), [isDarkMode]);

  const contextValue: ThemeContextType = {
    themeMode,
    setThemeMode,
    isDarkMode,
    tokens,
    loading,
  };

  return React.createElement(
    ThemeContext.Provider,
    { value: contextValue },
    children,
    veil
      ? React.createElement(Animated.View, {
          pointerEvents: 'none',
          style: [StyleSheet.absoluteFill, { backgroundColor: veil, opacity: veilOpacity }],
        })
      : null
  );
};
