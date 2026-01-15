
import React, { useState, useEffect, createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, darkColors } from '../styles/commonStyles';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'app_theme_mode';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDarkMode: boolean;
  currentColors: typeof colors;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  setThemeMode: async () => {},
  isDarkMode: false,
  currentColors: colors,
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

  useEffect(() => {
    console.log('ThemeProvider: System color scheme changed to:', systemColorScheme);
  }, [systemColorScheme]);

  useEffect(() => {
    console.log('ThemeProvider: Theme mode changed to:', themeMode);
  }, [themeMode]);

  const loadThemeMode = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      console.log('ThemeProvider: Loaded saved theme from storage:', savedTheme);
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
      console.log('ThemeProvider: Saving theme mode to storage:', mode);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeModeState(mode);
      console.log('ThemeProvider: Theme mode saved and state updated');
    } catch (error) {
      console.error('ThemeProvider: Error saving theme mode:', error);
      // Still update the state even if storage fails
      setThemeModeState(mode);
    }
  };

  const isDarkMode = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');
  const currentColors = isDarkMode ? darkColors : colors;

  useEffect(() => {
    console.log('ThemeProvider: Computed values updated', {
      themeMode,
      systemColorScheme,
      isDarkMode,
      currentColorsType: isDarkMode ? 'dark' : 'light'
    });
  }, [themeMode, systemColorScheme, isDarkMode]);

  const contextValue: ThemeContextType = {
    themeMode,
    setThemeMode,
    isDarkMode,
    currentColors,
    loading,
  };

  return React.createElement(
    ThemeContext.Provider,
    { value: contextValue },
    children
  );
};
