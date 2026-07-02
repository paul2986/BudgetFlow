import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    Image,
    Pressable,
} from 'react-native';
import { supabase, AUTH_REDIRECT_HTTPS } from '../utils/supabase';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import Button from './Button';
import Icon from './Icon';
import { Input, SegmentedControl } from './ui';
import { type, radius, space, elevation } from '../styles/tokens';

/**
 * Auth screen (DESIGN.md §2.7 Auth): static calm layout — no infinite
 * background animation — with labeled inputs, password visibility toggle,
 * correct autocomplete hints, and a reset-password path.
 */

interface AuthGuardProps {
    user: any;
    loading: boolean;
    children: React.ReactNode;
}

export default function AuthGuard({ user, loading, children }: AuthGuardProps) {
    const { tokens, isDarkMode } = useTheme();
    const { themedStyles } = useThemedStyles();
    const { showToast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
    const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

    // Match the page background on web while unauthenticated.
    useEffect(() => {
        if (Platform.OS === 'web' && !user) {
            document.body.style.backgroundColor = tokens.colors.bg;
            const metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) {
                metaThemeColor.setAttribute('content', tokens.colors.bg);
            }
        }
    }, [user, isDarkMode, tokens]);

    if (loading) {
        return (
            <View style={[themedStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={tokens.colors.brand} />
                <Text style={[themedStyles.textSecondary, { marginTop: space.s4 }]}>Loading your session…</Text>
            </View>
        );
    }

    if (user) {
        return <View style={{ flex: 1 }}>{children}</View>;
    }

    const validate = (): boolean => {
        const errors: { email?: string; password?: string } = {};
        if (!email.trim()) {
            errors.email = 'Enter your email address.';
        } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
            errors.email = 'That doesn’t look like a valid email address.';
        }
        if (!password) {
            errors.password = 'Enter your password.';
        } else if (authMode === 'register' && password.length < 8) {
            errors.password = 'Use at least 8 characters.';
        }
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleAuth = async () => {
        if (!validate()) return;

        setAuthLoading(true);
        try {
            const { error } = authMode === 'login'
                ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
                : await supabase.auth.signUp({ email: email.trim(), password });

            if (error) throw error;

            if (authMode === 'register') {
                showToast('Account created! Check your email to verify.', 'success');
            } else {
                showToast('Welcome back!', 'success');
            }
        } catch (err: any) {
            showToast(err.message || 'Something went wrong. Please try again.', 'error');
        } finally {
            setAuthLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
            setFieldErrors({ email: 'Enter your email above first, then tap reset.' });
            return;
        }
        setResetLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: AUTH_REDIRECT_HTTPS,
            });
            if (error) throw error;
            showToast('Password reset email sent. Check your inbox.', 'success');
        } catch (err: any) {
            showToast(err.message || 'Could not send reset email.', 'error');
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: tokens.colors.bg }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={{
                        flexGrow: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: space.s6,
                    }}
                    keyboardShouldPersistTaps="handled"
                >
                    <View
                        style={{
                            width: '100%',
                            maxWidth: 420,
                            backgroundColor: tokens.colors.surface,
                            borderRadius: radius.xl,
                            borderWidth: 1,
                            borderColor: tokens.colors.border,
                            padding: space.s7,
                            ...elevation.e2,
                        }}
                    >
                        {/* Brand */}
                        <View style={{ alignItems: 'center', marginBottom: space.s6 }}>
                            <Image
                                source={require('../assets/images/icon.png')}
                                style={{ width: 64, height: 64, borderRadius: radius.lg, marginBottom: space.s4 }}
                                resizeMode="cover"
                                accessibilityIgnoresInvertColors
                            />
                            <Text
                                accessibilityRole="header"
                                style={[type.h1, { color: tokens.colors.text, marginBottom: space.s1 }]}
                            >
                                Budget Flow
                            </Text>
                            <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center' }]}>
                                Calm, clear control of your household money.
                            </Text>
                        </View>

                        <SegmentedControl
                            label="Sign in or create account"
                            options={[
                                { value: 'login', label: 'Sign in' },
                                { value: 'register', label: 'Create account' },
                            ]}
                            value={authMode}
                            onChange={(mode) => {
                                setAuthMode(mode);
                                setFieldErrors({});
                            }}
                            style={{ marginBottom: space.s6 }}
                        />

                        <Input
                            label="Email address"
                            value={email}
                            onChangeText={(v) => {
                                setEmail(v);
                                if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: undefined }));
                            }}
                            error={fieldErrors.email}
                            placeholder="name@example.com"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoComplete="email"
                            textContentType="emailAddress"
                            containerStyle={{ marginBottom: space.s4 }}
                        />

                        <Input
                            label="Password"
                            value={password}
                            onChangeText={(v) => {
                                setPassword(v);
                                if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: undefined }));
                            }}
                            error={fieldErrors.password}
                            helperText={authMode === 'register' ? 'At least 8 characters.' : undefined}
                            placeholder="••••••••"
                            password
                            autoComplete={authMode === 'register' ? 'new-password' : 'password'}
                            textContentType={authMode === 'register' ? 'newPassword' : 'password'}
                            containerStyle={{ marginBottom: space.s6 }}
                        />

                        <Button
                            text={authMode === 'login' ? 'Sign in' : 'Create account'}
                            onPress={handleAuth}
                            loading={authLoading}
                            variant="primary"
                            size="lg"
                        />

                        {authMode === 'login' && (
                            <Pressable
                                onPress={handleResetPassword}
                                disabled={resetLoading}
                                accessibilityRole="button"
                                accessibilityLabel="Send password reset email"
                                style={{ marginTop: space.s4, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}
                            >
                                <Text style={[type.caption, { color: tokens.colors.brand }]}>
                                    {resetLoading ? 'Sending reset email…' : 'Forgot password?'}
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    <View style={{ marginTop: space.s6, flexDirection: 'row', alignItems: 'center', gap: space.s2, opacity: 0.8 }}>
                        <Icon name="lock-closed-outline" size={14} color={tokens.colors.textMuted} />
                        <Text style={[type.caption, { color: tokens.colors.textMuted }]}>
                            Your data is protected with row-level security
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
