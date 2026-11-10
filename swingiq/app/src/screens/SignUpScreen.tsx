/**
 * Sign Up Screen
 * --------------
 * Creates a new account with:
 *   - Display name, email, password
 *   - Password strength indicator
 *   - Real-time validation
 *   - Auto-navigates to onboarding after sign-up
 *     (to collect skill level + handicap)
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthContext } from '../components/AuthProvider';
import { Colors, Typography, Spacing, Radius } from '@/theme';

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: '',        color: 'transparent'        },
    { label: 'Weak',    color: Colors.severityFix    },
    { label: 'Fair',    color: Colors.severityImprove},
    { label: 'Good',    color: Colors.gold           },
    { label: 'Strong',  color: Colors.greenMid       },
  ];
  return { score, ...levels[score] };
}

export default function SignUpScreen() {
  const { signUp } = useAuthContext();

  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [showPwd,   setShowPwd]   = useState(false);

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const pwStrength = passwordStrength(password);
  const isValid    = name.trim().length >= 2 && email.includes('@') && password.length >= 6;

  const handleSignUp = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);

    const err = await signUp(email.trim().toLowerCase(), password, name.trim());

    if (err) {
      setError(err);
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Go to onboarding to collect skill level + handicap
      router.replace('/onboarding');
    }
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
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.heading}>Create account</Text>
            <Text style={styles.subheading}>Join SwingIQ and start improving your game</Text>

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️  {error}</Text>
              </View>
            )}

            {/* Name */}
            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alex Rivera"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={text => { setName(text); setError(null); }}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              ref={emailRef}
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
                onSubmitEditing={handleSignUp}
              />
              <TouchableOpacity
                style={styles.showPwdBtn}
                onPress={() => setShowPwd(s => !s)}
              >
                <Text style={styles.showPwdText}>{showPwd ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            {/* Password strength */}
            {password.length > 0 && (
              <View style={styles.strengthRow}>
                {[1,2,3,4].map(i => (
                  <View
                    key={i}
                    style={[
                      styles.strengthBar,
                      { backgroundColor: i <= pwStrength.score ? pwStrength.color : 'rgba(255,255,255,0.1)' }
                    ]}
                  />
                ))}
                <Text style={[styles.strengthLabel, { color: pwStrength.color }]}>
                  {pwStrength.label}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.cta, (!isValid || loading) && styles.ctaDisabled]}
              onPress={handleSignUp}
              disabled={!isValid || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.ctaText}>Create Account →</Text>
              }
            </TouchableOpacity>

            <Text style={styles.terms}>
              By signing up you agree to our Terms of Service and Privacy Policy.
            </Text>

            <TouchableOpacity
              style={styles.signInLink}
              onPress={() => router.push('/auth/sign-in')}
            >
              <Text style={styles.signInText}>
                Already have an account?{' '}
                <Text style={styles.signInHighlight}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll:        { flexGrow: 1, padding: Spacing.lg, paddingTop: Spacing.xl },
  backBtn:       { marginBottom: Spacing.xl },
  backText:      { color: Colors.textOnDarkDim, fontSize: Typography.sm },
  heading:       { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark, marginBottom: 6 },
  subheading:    { fontSize: Typography.sm, color: Colors.textOnDarkDim, marginBottom: Spacing.xl },
  errorBanner:   { backgroundColor: 'rgba(208,64,64,0.15)', borderWidth: 0.5, borderColor: 'rgba(208,64,64,0.4)', borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md },
  errorText:     { color: '#ff8080', fontSize: Typography.sm },
  label:         { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textOnDarkDim, marginBottom: 6, marginTop: Spacing.md, textTransform: 'uppercase', letterSpacing: 0.06 },
  input:         { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md, padding: Spacing.md, fontSize: Typography.base, color: Colors.textOnDark },
  passwordWrap:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  showPwdBtn:    { paddingHorizontal: Spacing.sm },
  showPwdText:   { fontSize: Typography.xs, color: Colors.textOnDarkDim, fontWeight: Typography.medium },
  strengthRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  strengthBar:   { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, marginLeft: 4, width: 48 },
  cta:           { backgroundColor: Colors.green, borderRadius: Radius.md, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xl },
  ctaDisabled:   { opacity: 0.45 },
  ctaText:       { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },
  terms:         { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  signInLink:    { alignItems: 'center', marginTop: Spacing.lg },
  signInText:    { fontSize: Typography.sm, color: Colors.textOnDarkDim },
  signInHighlight:{ color: Colors.greenGlow, fontWeight: Typography.semibold },
});
