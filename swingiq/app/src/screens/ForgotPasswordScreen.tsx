/**
 * Forgot Password Screen
 * -----------------------
 * Sends a password reset email via Supabase Auth.
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthContext } from '../components/AuthProvider';
import { Colors, Typography, Spacing, Radius } from '@/theme';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuthContext();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleReset = async () => {
    if (!email.includes('@')) return;
    setLoading(true);
    setError(null);
    const err = await resetPassword(email.trim().toLowerCase());
    setLoading(false);
    if (err) {
      setError(err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      setSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.body}>
          {sent ? (
            <>
              <Text style={styles.successIcon}>📬</Text>
              <Text style={styles.heading}>Check your email</Text>
              <Text style={styles.sub}>
                We sent a password reset link to{'\n'}
                <Text style={{ color: Colors.greenGlow }}>{email}</Text>
              </Text>
              <TouchableOpacity style={styles.cta} onPress={() => router.replace('/auth/sign-in')}>
                <Text style={styles.ctaText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.heading}>Reset password</Text>
              <Text style={styles.sub}>
                Enter your email and we'll send you a link to reset your password.
              </Text>
              {error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>⚠️  {error}</Text>
                </View>
              )}
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={text => { setEmail(text); setError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleReset}
              />
              <TouchableOpacity
                style={[styles.cta, (!email.includes('@') || loading) && styles.ctaDisabled]}
                onPress={handleReset}
                disabled={!email.includes('@') || loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.ctaText}>Send Reset Link →</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  backBtn:     { padding: Spacing.lg },
  backText:    { color: Colors.textOnDarkDim, fontSize: Typography.sm },
  body:        { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  successIcon: { fontSize: 52, textAlign: 'center', marginBottom: Spacing.lg },
  heading:     { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark, marginBottom: Spacing.sm },
  sub:         { fontSize: Typography.sm, color: Colors.textOnDarkDim, lineHeight: 22, marginBottom: Spacing.xl, textAlign: 'center' },
  errorBanner: { backgroundColor: 'rgba(208,64,64,0.15)', borderWidth: 0.5, borderColor: 'rgba(208,64,64,0.4)', borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md },
  errorText:   { color: '#ff8080', fontSize: Typography.sm },
  label:       { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textOnDarkDim, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.06 },
  input:       { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md, padding: Spacing.md, fontSize: Typography.base, color: Colors.textOnDark, marginBottom: 0 },
  cta:         { backgroundColor: Colors.green, borderRadius: Radius.md, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xl },
  ctaDisabled: { opacity: 0.45 },
  ctaText:     { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },
});
