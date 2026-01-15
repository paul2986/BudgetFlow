
import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
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

export default function AuthGuard({ user, loading, children }: AuthGuardProps) {
    const { currentColors } = useTheme();
    const { themedStyles } = useThemedStyles();
    const { showToast } = useToast();

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

    if (user) {
        return <>{children}</>;
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
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: currentColors.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={{
                    flexGrow: 1,
                    justifyContent: 'center',
                    padding: 24,
                }}
                keyboardShouldPersistTaps="handled"
            >
                <View style={{ alignItems: 'center', marginBottom: 40 }}>
                    <View style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        backgroundColor: currentColors.primary + '20',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 20
                    }}>
                        <Icon name="wallet" size={40} style={{ color: currentColors.primary }} />
                    </View>
                    <Text style={[themedStyles.title, { marginBottom: 8 }]}>Budget Flow</Text>
                    <Text style={[themedStyles.textSecondary, { textAlign: 'center' }]}>
                        Securely manage your personal and household finances in the cloud.
                    </Text>
                </View>

                <View style={[themedStyles.card, { padding: 24 }]}>
                    <Text style={[themedStyles.subtitle, { marginBottom: 24 }]}>
                        {authMode === 'login' ? 'Sign In' : 'Create Account'}
                    </Text>

                    <TextInput
                        style={[themedStyles.input, { marginBottom: 16 }]}
                        placeholder="Email Address"
                        placeholderTextColor={currentColors.textSecondary}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                    />

                    <TextInput
                        style={[themedStyles.input, { marginBottom: 24 }]}
                        placeholder="Password"
                        placeholderTextColor={currentColors.textSecondary}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="password"
                    />

                    <Button
                        text={authLoading ? 'Processing...' : (authMode === 'login' ? 'Sign In' : 'Sign Up')}
                        onPress={handleAuth}
                        disabled={authLoading}
                    />

                    <TouchableOpacity
                        onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                        style={{ marginTop: 20, alignItems: 'center' }}
                        disabled={authLoading}
                    >
                        <Text style={[themedStyles.textSecondary, { color: currentColors.primary, fontWeight: '600' }]}>
                            {authMode === 'login'
                                ? "Don't have an account? Sign Up"
                                : "Already have an account? Sign In"}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={{ marginTop: 40, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Icon name="cloud-upload" size={16} style={{ color: currentColors.textSecondary }} />
                        <Text style={[themedStyles.textSecondary, { fontSize: 13 }]}>
                            Data is end-to-end encrypted and synced to your private cloud.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
