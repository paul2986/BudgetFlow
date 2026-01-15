
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    useWindowDimensions,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import { supabase } from '../utils/supabase';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import Button from './Button';
import Icon from './Icon';

interface AuthGuardProps {
    user: any;
    loading: boolean;
    children: React.ReactNode;
}

const AnimatedCircle = ({ size, color, delay, duration, initialX, initialY }: any) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const opacity = useSharedValue(0.1);

    useEffect(() => {
        translateX.value = withDelay(
            delay,
            withRepeat(
                withTiming(Math.random() * 100 - 50, {
                    duration: duration,
                    easing: Easing.inOut(Easing.sin),
                }),
                -1,
                true
            )
        );
        translateY.value = withDelay(
            delay,
            withRepeat(
                withTiming(Math.random() * 100 - 50, {
                    duration: duration * 1.2,
                    easing: Easing.inOut(Easing.sin),
                }),
                -1,
                true
            )
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
        ],
        opacity: opacity.value,
    }));

    return (
        <Animated.View
            style={[
                {
                    position: 'absolute',
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                    left: initialX,
                    top: initialY,
                },
                animatedStyle,
            ]}
        />
    );
};

export default function AuthGuard({ user, loading, children }: AuthGuardProps) {
    const { currentColors, isDarkMode } = useTheme();
    const { themedStyles } = useThemedStyles();
    const { showToast } = useToast();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768;

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

    if (loading) {
        return (
            <View style={[themedStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={currentColors.primary} />
                <Text style={[themedStyles.textSecondary, { marginTop: 16 }]}>Loading your session...</Text>
            </View>
        );
    }

    const insets = useSafeAreaInsets();

    if (user) {
        return (
            <View style={{
                flex: 1,
                paddingTop: (!isDesktop && Platform.OS !== 'web') ? insets.top : 0,
                paddingBottom: (!isDesktop && Platform.OS !== 'web') ? insets.bottom : 0
            }}>
                {children}
            </View>
        );
    }

    const handleAuth = async () => {
        if (!email || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        setAuthLoading(true);
        try {
            const { error } = authMode === 'login'
                ? await supabase.auth.signInWithPassword({ email, password })
                : await supabase.auth.signUp({ email, password });

            if (error) throw error;

            if (authMode === 'register') {
                showToast('Account created! Please check your email for verification.', 'success');
            } else {
                showToast('Welcome back!', 'success');
            }
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setAuthLoading(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: isDarkMode ? '#0F1419' : '#F8F9FA', overflow: 'hidden' }}>
            {/* Animated Background Layers */}
            <View style={{
                ...StyleSheet.absoluteFillObject,
                // @ts-ignore - web only fix for address bar bleed
                ...(Platform.OS === 'web' ? { position: 'fixed', height: '100vh', width: '100vw', zIndex: 0 } : {})
            } as any}>
                <AnimatedCircle size={400} color={currentColors.primary} delay={0} duration={10000} initialX="-10%" initialY="-10%" />
                <AnimatedCircle size={300} color={currentColors.secondary} delay={1000} duration={12000} initialX="70%" initialY="60%" />
                <AnimatedCircle size={250} color={currentColors.accent} delay={2000} duration={8000} initialX="10%" initialY="70%" />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={{
                        flexGrow: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: 24,
                    }}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={{
                        width: '100%',
                        maxWidth: isDesktop ? 450 : '100%',
                        backgroundColor: isDarkMode ? 'rgba(26, 35, 50, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                        borderRadius: 24,
                        padding: isDesktop ? 48 : 32,
                        borderWidth: 1,
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        boxShadow: '0px 20px 40px rgba(0, 0, 0, 0.1)',
                        backdropFilter: Platform.OS === 'web' ? 'blur(20px)' : 'none',
                    }}>
                        <View style={{ alignItems: 'center', marginBottom: 32 }}>
                            <View style={{
                                width: 72,
                                height: 72,
                                borderRadius: 20,
                                backgroundColor: currentColors.primary,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 20,
                                transform: [{ rotate: '-10deg' }],
                                shadowColor: currentColors.primary,
                                shadowOffset: { width: 0, height: 8 },
                                shadowOpacity: 0.3,
                                shadowRadius: 12,
                            }}>
                                <Icon name="wallet" size={36} style={{ color: '#FFFFFF' }} />
                            </View>
                            <Text style={{
                                fontSize: 32,
                                fontWeight: '800',
                                color: currentColors.text,
                                marginBottom: 8,
                                letterSpacing: -1
                            }}>Budget Flow</Text>
                            <Text style={{
                                fontSize: 15,
                                color: currentColors.textSecondary,
                                textAlign: 'center',
                                lineHeight: 22
                            }}>
                                Master your money with{'\n'}secure cloud-native sync.
                            </Text>
                        </View>

                        <View>
                            <Text style={{
                                fontSize: 18,
                                fontWeight: '700',
                                color: currentColors.text,
                                marginBottom: 24
                            }}>
                                {authMode === 'login' ? 'Sign In' : 'Create Account'}
                            </Text>

                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: currentColors.textSecondary, marginBottom: 8, marginLeft: 4 }}>Email Address</Text>
                                <TextInput
                                    style={[themedStyles.input, { marginBottom: 0, height: 54, borderRadius: 14 }]}
                                    placeholder="name@example.com"
                                    placeholderTextColor={currentColors.textSecondary}
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    autoComplete="email"
                                />
                            </View>

                            <View style={{ marginBottom: 24 }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: currentColors.textSecondary, marginBottom: 8, marginLeft: 4 }}>Password</Text>
                                <TextInput
                                    style={[themedStyles.input, { marginBottom: 0, height: 54, borderRadius: 14 }]}
                                    placeholder="••••••••"
                                    placeholderTextColor={currentColors.textSecondary}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    autoComplete="password"
                                />
                            </View>

                            <TouchableOpacity
                                onPress={handleAuth}
                                disabled={authLoading}
                                activeOpacity={0.8}
                                style={{
                                    backgroundColor: currentColors.primary,
                                    height: 54,
                                    borderRadius: 14,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    shadowColor: currentColors.primary,
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 8,
                                }}
                            >
                                {authLoading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
                                        {authMode === 'login' ? 'Sign In' : 'Get Started'}
                                    </Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                                style={{ marginTop: 24, alignItems: 'center' }}
                                disabled={authLoading}
                            >
                                <Text style={{ fontSize: 14, color: currentColors.textSecondary }}>
                                    {authMode === 'login' ? "New here? " : "Already have an account? "}
                                    <Text style={{ color: currentColors.primary, fontWeight: '700' }}>
                                        {authMode === 'login' ? "Sign Up" : "Sign In"}
                                    </Text>
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={{ marginTop: 32, alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.6 }}>
                            <Icon name="shield-checkmark" size={14} style={{ color: currentColors.textSecondary }} />
                            <Text style={{ fontSize: 12, color: currentColors.textSecondary }}>
                                Secure, encrypted cloud storage
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
