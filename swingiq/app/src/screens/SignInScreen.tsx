/**
 * Sign In Screen
 * --------------
 * Email + password login with:
 *   - Real-time inline validation
 *   - Friendly error messages from Supabase
 *   - "Forgot password" flow
 *   - Link to Sign Up
 *   - Haptic feedback on success/failure
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthContext } from '../components/AuthProvider';
import { Colors, Typography, Spacing, Radius } from '@/theme';

export default function SignInScreen() {
  const { signIn } = useAuthContext();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [showPwd,  setShowPwd]  = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const isValid = email.includes('@') && password.length >= 6;

  const handleSignIn = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    const err = await signIn(email.trim().toLowerCase(), password);

    if (err) {
      setError(err);
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/home');
    }
  };

  const handleForgotPassword = () => {
    router.push('/auth/forgot-password');
  };

  return (
    <LinearGradient colors={[Colors.dark, Colors.darkMid, '#1a3d24']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo / brand */}
            <View style={styles.brand}>
              <Text style={styles.brandIcon}>⛳</Text>
              <Text style={styles.brandName}>SwingIQ</Text>
              <Text style={styles.brandTagline}>AI Golf Coaching</Text>
            </View>

            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>Sign in to continue your training</Text>

            {/* Error banner */}
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️  {error}</Text>
              </View>
            )}

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={text => { setEmail(text); setError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            {/* Password */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="At least 6 characters"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={text => { setPassword(text); setError(null); }}
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
              <TouchableOpacity
                style={styles.showPwdBtn}
                onPress={() => setShowPwd(s => !s)}
              >
                <Text style={styles.showPwdText}>{showPwd ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            {/* Forgot password */}
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Sign In button */}
            <TouchableOpacity
              style={[styles.cta, (!isValid || loading) && styles.ctaDisabled]}
              onPress={handleSignIn}
              disabled={!isValid || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.ctaText}>Sign In →</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Sign up link */}
            <TouchableOpacity
              style={styles.signUpBtn}
              onPress={() => router.push('/auth/sign-up')}
            >
              <Text style={styles.signUpText}>
                New to SwingIQ?{' '}
                <Text style={styles.signUpLink}>Create account</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll:       { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },

  brand:        { alignItems: 'center', marginBottom: Spacing.xxxl },
  brandIcon:    { fontSize: 52, marginBottom: Spacing.sm },
  brandName:    { fontSize: Typography.hero, fontWeight: Typography.bold, color: Colors.textOnDark },
  brandTagline: { fontSize: Typography.sm, color: Colors.textOnDarkDim, marginTop: 4 },

  heading:      { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark, marginBottom: 6 },
  subheading:   { fontSize: Typography.sm,  color: Colors.textOnDarkDim, marginBottom: Spacing.xl },

  errorBanner:  { backgroundColor: 'rgba(208,64,64,0.15)', borderWidth: 0.5, borderColor: 'rgba(208,64,64,0.4)', borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md },
  errorText:    { color: '#ff8080', fontSize: Typography.sm },

  label:        { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textOnDarkDim, marginBottom: 6, marginTop: Spacing.md, textTransform: 'uppercase', letterSpacing: 0.06 },
  input:        { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md, padding: Spacing.md, fontSize: Typography.base, color: Colors.textOnDark, marginBottom: 0 },

  passwordWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  showPwdBtn:   { paddingHorizontal: Spacing.sm },
  showPwdText:  { fontSize: Typography.xs, color: Colors.textOnDarkDim, fontWeight: Typography.medium },

  forgotBtn:    { alignSelf: 'flex-end', marginTop: Spacing.sm },
  forgotText:   { fontSize: Typography.xs, color: Colors.greenGlow },

  cta:          { backgroundColor: Colors.green, borderRadius: Radius.md, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xl },
  ctaDisabled:  { opacity: 0.45 },
  ctaText:      { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },

  divider:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
  dividerLine:  { flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerText:  { fontSize: Typography.xs, color: Colors.textOnDarkDim },

  signUpBtn:    { alignItems: 'center' },
  signUpText:   { fontSize: Typography.sm, color: Colors.textOnDarkDim },
  signUpLink:   { color: Colors.greenGlow, fontWeight: Typography.semibold },
});
