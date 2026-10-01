import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    Image,
    Pressable,
    TextInput,
} from 'react-native';
import { supabase, emailLinkRedirect, openedFromRecoveryLink, authLinkError } from '../utils/supabase';
import { consumeAuthNotice, type AuthNotice } from '../utils/authNotice';
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
 * correct autocomplete hints, and a reset-password path. Arriving from a
 * reset email signs the user in; they then choose a new password before
 * reaching the app. Outcomes that need more than a toast (account created,
 * account deleted) get their own confirmation screen.
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
    const passwordRef = useRef<TextInput>(null);
    const [recoveryPending, setRecoveryPending] = useState(openedFromRecoveryLink);
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordError, setNewPasswordError] = useState<string>();
    const [savingPassword, setSavingPassword] = useState(false);
    const [notice, setNotice] = useState<AuthNotice | null>(null);
    const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
    const [resendingConfirmation, setResendingConfirmation] = useState(false);

    // Pick up a notice left by the sign-out that brought us here.
    useEffect(() => {
        if (loading || user) return;
        const pending = consumeAuthNotice();
        if (pending) setNotice(pending);
    }, [loading, user]);

    // An email link that failed (e.g. expired) lands back on sign-in; say why.
    useEffect(() => {
        if (authLinkError) showToast(authLinkError, 'error', 8000);
    }, [showToast]);

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

    const handleSaveNewPassword = async () => {
        if (newPassword.length < 8) {
            setNewPasswordError('Use at least 8 characters.');
            return;
        }
        setSavingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setRecoveryPending(false);
            setNewPassword('');
            showToast('Password updated', 'success');
        } catch (err: any) {
            setNewPasswordError(err.message || 'Couldn’t update your password. Please try again.');
        } finally {
            setSavingPassword(false);
        }
    };

    if (user && recoveryPending) {
        return (
            <AuthShell>
                <Text
                    accessibilityRole="header"
                    style={[type.h3, { color: tokens.colors.text, marginBottom: space.s2 }]}
                >
                    Choose a new password
                </Text>
                <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s6 }]}>
                    {user.email ? `For ${user.email}. ` : ''}You’ll use it the next time you sign in.
                </Text>

                <Input
                    label="New password"
                    value={newPassword}
                    onChangeText={(v) => {
                        setNewPassword(v);
                        if (newPasswordError) setNewPasswordError(undefined);
                    }}
                    error={newPasswordError}
                    helperText="At least 8 characters."
                    placeholder="••••••••"
                    password
                    autoFocus
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    onSubmitEditing={() => {
                        if (!savingPassword) handleSaveNewPassword();
                    }}
                    containerStyle={{ marginBottom: space.s6 }}
                />

                <Button
                    text="Save password"
                    onPress={handleSaveNewPassword}
                    loading={savingPassword}
                    variant="primary"
                    size="lg"
                />

                <Pressable
                    onPress={() => setRecoveryPending(false)}
                    disabled={savingPassword}
                    accessibilityRole="button"
                    accessibilityLabel="Keep your current password and continue"
                    style={{ marginTop: space.s4, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}
                >
                    <Text style={[type.caption, { color: tokens.colors.brand }]}>Not now</Text>
                </Pressable>
            </AuthShell>
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
            if (authMode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) throw error;
                showToast('Welcome back!', 'success');
            } else {
                const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { emailRedirectTo: emailLinkRedirect() },
                });
                if (error) throw error;
                // With email confirmation on there's no session yet: explain the
                // next step. (If it's off, the new session opens the app.)
                if (!data.session) {
                    setConfirmationEmail(email.trim());
                    setPassword('');
                }
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
                redirectTo: emailLinkRedirect(),
            });
            if (error) throw error;
            showToast('Password reset email sent. Check your inbox.', 'success');
        } catch (err: any) {
            showToast(err.message || 'Could not send reset email.', 'error');
        } finally {
            setResetLoading(false);
        }
    };

    const handleResendConfirmation = async () => {
        if (!confirmationEmail) return;
        setResendingConfirmation(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: confirmationEmail,
                options: { emailRedirectTo: emailLinkRedirect() },
            });
            if (error) throw error;
            showToast('Confirmation email sent again.', 'success');
        } catch (err: any) {
            showToast(err.message || 'Couldn’t resend the email. Please try again.', 'error');
        } finally {
            setResendingConfirmation(false);
        }
    };

    if (notice === 'account-deleted') {
        return (
            <AuthShell>
                <AuthMessage
                    icon="checkmark"
                    iconColor={tokens.colors.income}
                    iconBackground={tokens.colors.incomeSubtle}
                    title="Account deleted"
                    body="Your account and every budget, person and expense in it have been permanently deleted. Shared budgets stay with the people you shared them with."
                />
                <Button text="Done" onPress={() => setNotice(null)} variant="primary" size="lg" />
            </AuthShell>
        );
    }

    if (confirmationEmail) {
        return (
            <AuthShell>
                <AuthMessage
                    icon="mail-unread-outline"
                    iconColor={tokens.colors.brand}
                    iconBackground={tokens.colors.brandSubtle}
                    title="Check your email"
                    body={`We sent a confirmation link to ${confirmationEmail}. Open it to finish creating your account.`}
                    caption="Can’t find it? Check your spam or junk folder."
                />
                <Button
                    text="Back to sign in"
                    onPress={() => {
                        setConfirmationEmail(null);
                        setAuthMode('login');
                    }}
                    variant="primary"
                    size="lg"
                />
                <Pressable
                    onPress={handleResendConfirmation}
                    disabled={resendingConfirmation}
                    accessibilityRole="button"
                    accessibilityLabel="Resend confirmation email"
                    style={{ marginTop: space.s4, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}
                >
                    <Text style={[type.caption, { color: tokens.colors.brand }]}>
                        {resendingConfirmation ? 'Sending…' : 'Resend email'}
                    </Text>
                </Pressable>
            </AuthShell>
        );
    }

    return (
        <AuthShell>
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
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
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
                ref={passwordRef}
                returnKeyType="go"
                onSubmitEditing={() => {
                    if (!authLoading) handleAuth();
                }}
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
        </AuthShell>
    );
}

/** The centered card, brand header and security note shared by the auth forms. */
function AuthShell({ children }: { children: React.ReactNode }) {
    const { tokens } = useTheme();

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

                        {children}
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

interface AuthMessageProps {
    icon: React.ComponentProps<typeof Icon>['name'];
    iconColor: string;
    iconBackground: string;
    title: string;
    body: string;
    caption?: string;
}

/** A centered icon, heading and explanation for auth confirmation screens. */
function AuthMessage({ icon, iconColor, iconBackground, title, body, caption }: AuthMessageProps) {
    const { tokens } = useTheme();

    return (
        <View style={{ alignItems: 'center', marginBottom: space.s6 }}>
            <View
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: radius.full,
                    backgroundColor: iconBackground,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: space.s4,
                }}
            >
                <Icon name={icon} size={28} color={iconColor} />
            </View>
            <Text
                accessibilityRole="header"
                style={[type.h3, { color: tokens.colors.text, marginBottom: space.s2, textAlign: 'center' }]}
            >
                {title}
            </Text>
            <Text style={[type.body, { color: tokens.colors.textMuted, textAlign: 'center' }]}>
                {body}
            </Text>
            {caption && (
                <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center', marginTop: space.s3 }]}>
                    {caption}
                </Text>
            )}
        </View>
    );
}
