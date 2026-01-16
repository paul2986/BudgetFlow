
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
    Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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

    const brandGradient = (currentColors as any).brandGradient || ['#00C853', '#00BFA5'];

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

    // IMPORTANT: All hooks must be called before any conditional returns
    const insets = useSafeAreaInsets();

    // Set body background to match login screen on web
    useEffect(() => {
        if (Platform.OS === 'web' && !user) {
            const loginBgColor = currentColors.background;
            document.body.style.backgroundColor = loginBgColor;
            // Also update the theme-color meta tag
            const metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) {
                metaThemeColor.setAttribute('content', loginBgColor);
            }
        }
    }, [user, isDarkMode]);

    if (loading) {
        return (
            <View style={[themedStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={currentColors.primary} />
                <Text style={[themedStyles.textSecondary, { marginTop: 16 }]}>Loading your session...</Text>
            </View>
        );
    }

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
        <View style={{ flex: 1, backgroundColor: currentColors.background, overflow: 'hidden' }}>
            {/* Animated Background Layers */}
            <View style={{
                ...StyleSheet.absoluteFillObject,
                // @ts-ignore - web only fix for address bar bleed. Aggressive overscan for Safari iOS.
                ...(Platform.OS === 'web' ? { position: 'fixed', top: -300, left: -300, right: -300, bottom: -300, zIndex: 0 } : {})
            } as any}>
                <AnimatedCircle size={400} color={brandGradient[0] + '20'} delay={0} duration={10000} initialX="-10%" initialY="-10%" />
                <AnimatedCircle size={300} color={brandGradient[1] + '20'} delay={1000} duration={12000} initialX="70%" initialY="60%" />
                <AnimatedCircle size={250} color={currentColors.secondary + '20'} delay={2000} duration={8000} initialX="10%" initialY="70%" />
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
                        backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                        borderRadius: 24,
                        padding: isDesktop ? 48 : 32,
                        borderWidth: 1,
                        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        boxShadow: '0px 20px 40px rgba(0, 0, 0, 0.1)',
                        // @ts-ignore
                        backdropFilter: Platform.OS === 'web' ? 'blur(20px)' : 'none',
                    }}>
                        <View style={{ alignItems: 'center', marginBottom: 32 }}>
                            <View style={{
                                width: 80,
                                height: 80,
                                borderRadius: 18,
                                overflow: 'visible',
                                marginBottom: 20,
                                shadowColor: brandGradient[0],
                                shadowOffset: { width: 0, height: 6 },
                                shadowOpacity: 0.4,
                                shadowRadius: 15,
                                // Multi-layer drop shadow for gradient glow effect
                                // @ts-ignore
                                ...(Platform.OS === 'web' ? {
                                    filter: `drop-shadow(0 6px 10px ${brandGradient[0]}60) drop-shadow(0 6px 15px ${brandGradient[1]}40) drop-shadow(0 6px 20px ${brandGradient[2]}20)`
                                } : {}),
                            }}>
                                <View style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: 18,
                                    overflow: 'hidden',
                                    backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                                }}>
                                    <Image
                                        source={require('../assets/images/icon.png')}
                                        style={{ width: '100%', height: '100%' }}
                                        resizeMode="cover"
                                    />
                                </View>
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

                            <Button
                                text={authMode === 'login' ? 'Sign In' : 'Get Started'}
                                onPress={handleAuth}
                                loading={authLoading}
                                variant="primary"
                            />

                            <TouchableOpacity
                                onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                                style={{ marginTop: 24, alignItems: 'center' }}
                                disabled={authLoading}
                            >
                                <Text style={{ fontSize: 14, color: currentColors.textSecondary }}>
                                    {authMode === 'login' ? "New here? " : "Already have an account? "}
                                    <Text style={{ color: brandGradient[0], fontWeight: '700' }}>
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
