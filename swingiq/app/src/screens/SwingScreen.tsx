/**
 * Swing Screen
 * ------------
 * The core feature. Two modes:
 *
 *   RECORD mode: Uses expo-camera to record a video directly in-app.
 *   UPLOAD mode: Uses expo-image-picker to select a video from the library.
 *
 * After a video is selected/recorded, the user picks their club and taps
 * "Analyse Swing". The video is sent to the backend API.
 *
 * While analysing, a progress overlay is shown (can take 10–20 seconds).
 * On success, the user is navigated to the Results screen.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Modal, Pressable,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore } from '@/store';
import { analyzeSwing } from '@/services/api';
import { PrimaryButton } from '@/components/ui';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';

const CLUBS = ['Driver','3-wood','5-wood','3-iron','4-iron','5-iron','6-iron','7-iron','8-iron','9-iron','PW','SW','LW','Putter'];

type Mode = 'select' | 'camera' | 'preview';

export default function SwingScreen() {
  const { profile, addSession, setIsAnalyzing, setAnalysisError, isAnalyzing } = useStore();
  const [mode, setMode]           = useState<Mode>('select');
  const [videoUri, setVideoUri]   = useState<string | null>(null);
  const [club, setClub]           = useState('7-iron');
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [isRecording, setIsRecording]       = useState(false);
  const [recordingSecs, setRecordingSecs]   = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const [camPerm,  requestCamPerm]  = useCameraPermissions();
  const [micPerm,  requestMicPerm]  = useMicrophonePermissions();

  // ── Camera recording timer ────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current!);
      setRecordingSecs(0);
    }
    return () => clearInterval(timerRef.current!);
  }, [isRecording]);

  // ── Pick from library ─────────────────────────────────────────────────────
  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
      setMode('preview');
    }
  };

  // ── Open camera ───────────────────────────────────────────────────────────
  const openCamera = async () => {
    if (!camPerm?.granted) {
      const { granted } = await requestCamPerm();
      if (!granted) { Alert.alert('Camera access needed', 'Please allow camera access in Settings.'); return; }
    }
    if (!micPerm?.granted) {
      await requestMicPerm();
    }
    setMode('camera');
  };

  // ── Start/stop recording ──────────────────────────────────────────────────
  const startRecording = async () => {
    if (!cameraRef.current) return;
    setIsRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 20 });
      if (video?.uri) {
        setVideoUri(video.uri);
        setMode('preview');
      }
    } catch (e) {
      console.warn('Record error', e);
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    cameraRef.current?.stopRecording();
    setIsRecording(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Submit for analysis ───────────────────────────────────────────────────
  const submitAnalysis = async () => {
    if (!videoUri) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const session = await analyzeSwing({
        videoUri,
        playerName:  profile.name || 'Golfer',
        skillLevel:  profile.skillLevel,
        clubUsed:    club,
      });
      addSession(session);
      router.push('/swing/results');
    } catch (err: any) {
      const msg = err?.message ?? 'Analysis failed. Please try again.';
      setAnalysisError(msg);
      Alert.alert('Analysis failed', msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Analysing overlay ─────────────────────────────────────────────────────
  if (isAnalyzing) {
    return (
      <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.analysingScreen}>
        <View style={styles.analysingCard}>
          <ActivityIndicator size="large" color={Colors.greenGlow} />
          <Text style={styles.analysingTitle}>Analysing your swing…</Text>
          <Text style={styles.analysingSteps}>
            {'→ Extracting pose landmarks\n→ Computing swing metrics\n→ Generating AI coaching feedback'}
          </Text>
          <Text style={styles.analysingNote}>This usually takes 10–20 seconds</Text>
        </View>
      </LinearGradient>
    );
  }

  // ── Camera view ───────────────────────────────────────────────────────────
  if (mode === 'camera') {
    return (
      <View style={StyleSheet.absoluteFill}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="video"
        />
        {/* Overlay */}
        <SafeAreaView style={styles.cameraOverlay} edges={['top', 'bottom']}>
          {/* Top bar */}
          <View style={styles.cameraTopBar}>
            <TouchableOpacity onPress={() => setMode('select')} style={styles.cameraBackBtn}>
              <Text style={styles.cameraBackText}>✕</Text>
            </TouchableOpacity>
            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recDot} />
                <Text style={styles.recTimer}>
                  {String(Math.floor(recordingSecs / 60)).padStart(2,'0')}:
                  {String(recordingSecs % 60).padStart(2,'0')}
                </Text>
              </View>
            )}
          </View>

          {/* Guide overlay */}
          {!isRecording && (
            <View style={styles.guideBox}>
              <Text style={styles.guideText}>Position yourself so your full body is visible</Text>
              <Text style={styles.guideSub}>Place phone on a stable surface or tripod · Face the camera</Text>
            </View>
          )}

          {/* Record button */}
          <View style={styles.cameraBottomBar}>
            <TouchableOpacity
              style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <View style={[styles.recordBtnInner, isRecording && styles.recordBtnInnerStop]} />
            </TouchableOpacity>
            <Text style={styles.recordLabel}>
              {isRecording ? 'Tap to stop' : 'Tap to record (max 20s)'}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Preview (video selected, ready to analyse) ────────────────────────────
  if (mode === 'preview' && videoUri) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView>
          <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.previewHero}>
            <TouchableOpacity onPress={() => setMode('select')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.previewTitle}>Video Ready</Text>
            <Text style={styles.previewSub}>Select your club and submit for analysis</Text>
            <View style={styles.videoReadyBox}>
              <Text style={styles.videoReadyIcon}>🎬</Text>
              <Text style={styles.videoReadyText}>Swing video loaded</Text>
              <TouchableOpacity onPress={() => setVideoUri(null) || setMode('select')}>
                <Text style={styles.videoChangeBtn}>Change video</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <View style={styles.formSection}>
            <Text style={styles.formLabel}>Club used</Text>
            <TouchableOpacity
              style={styles.clubSelector}
              onPress={() => setClubPickerOpen(true)}
            >
              <Text style={styles.clubSelectorText}>{club}</Text>
              <Text style={styles.clubSelectorArrow}>▾</Text>
            </TouchableOpacity>

            <Text style={styles.formHint}>
              Skill level: <Text style={{ color: Colors.green }}>{profile.skillLevel}</Text> — 
              the AI will tailor feedback accordingly
            </Text>

            <PrimaryButton
              label="Analyse Swing →"
              onPress={submitAnalysis}
              style={{ marginTop: Spacing.xl }}
            />
          </View>
        </ScrollView>

        {/* Club picker modal */}
        <Modal visible={clubPickerOpen} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setClubPickerOpen(false)}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>Select Club</Text>
              <ScrollView>
                {CLUBS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pickerItem, club === c && styles.pickerItemSelected]}
                    onPress={() => { setClub(c); setClubPickerOpen(false); }}
                  >
                    <Text style={[styles.pickerItemText, club === c && styles.pickerItemTextSelected]}>{c}</Text>
                    {club === c && <Text style={{ color: Colors.green }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Select mode (default) ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.selectHero}>
        <Text style={styles.selectTitle}>Swing Analysis</Text>
        <Text style={styles.selectSub}>Upload or record your swing for AI coaching</Text>
      </LinearGradient>

      <View style={styles.selectOptions}>
        <TouchableOpacity style={styles.optionCard} onPress={openCamera} activeOpacity={0.8}>
          <Text style={styles.optionIcon}>📷</Text>
          <Text style={styles.optionTitle}>Record Now</Text>
          <Text style={styles.optionDesc}>Use your camera to record a swing right now</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard} onPress={pickFromLibrary} activeOpacity={0.8}>
          <Text style={styles.optionIcon}>📁</Text>
          <Text style={styles.optionTitle}>Upload Video</Text>
          <Text style={styles.optionDesc}>Pick an existing swing video from your library</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>📐 For best results</Text>
        <Text style={styles.tipText}>• Film from down-the-line or face-on{'\n'}• Full body visible in frame{'\n'}• Good lighting · Phone steady{'\n'}• Keep clip to 5–10 seconds</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Analysing overlay
  analysingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  analysingCard:   { alignItems: 'center', gap: Spacing.lg },
  analysingTitle:  { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textOnDark },
  analysingSteps:  { fontSize: Typography.sm, color: Colors.textOnDarkDim, textAlign: 'left', lineHeight: Typography.sm * 1.8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  analysingNote:   { fontSize: Typography.xs, color: Colors.textMuted },

  // Camera
  cameraOverlay:    { flex: 1, justifyContent: 'space-between' },
  cameraTopBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  cameraBackBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.overlay50, alignItems: 'center', justifyContent: 'center' },
  cameraBackText:   { color: '#fff', fontSize: Typography.base },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.overlay50, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  recDot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4040' },
  recTimer:         { color: '#fff', fontSize: Typography.sm, fontWeight: Typography.semibold },
  guideBox:         { margin: Spacing.lg, backgroundColor: Colors.overlay50, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  guideText:        { color: '#fff', fontSize: Typography.sm, fontWeight: Typography.medium, textAlign: 'center' },
  guideSub:         { color: 'rgba(255,255,255,0.6)', fontSize: Typography.xs, textAlign: 'center', marginTop: 4 },
  cameraBottomBar:  { alignItems: 'center', paddingBottom: Spacing.xl, gap: Spacing.md },
  recordBtn:        { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  recordBtnActive:  { borderColor: '#ff4040' },
  recordBtnInner:   { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ff4040' },
  recordBtnInnerStop: { borderRadius: 6, width: 28, height: 28 },
  recordLabel:      { color: 'rgba(255,255,255,0.7)', fontSize: Typography.xs },

  // Preview
  previewHero:  { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  backBtn:      { marginBottom: Spacing.md },
  backBtnText:  { color: Colors.textOnDarkDim, fontSize: Typography.sm },
  previewTitle: { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark },
  previewSub:   { fontSize: Typography.sm, color: Colors.textOnDarkDim, marginTop: 4 },
  videoReadyBox:{ marginTop: Spacing.lg, backgroundColor: 'rgba(109,207,142,0.1)', borderWidth: 0.5, borderColor: 'rgba(109,207,142,0.3)', borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 6 },
  videoReadyIcon:{ fontSize: 32 },
  videoReadyText:{ color: Colors.greenGlow, fontSize: Typography.sm, fontWeight: Typography.semibold },
  videoChangeBtn:{ color: Colors.textOnDarkDim, fontSize: Typography.xs, textDecorationLine: 'underline' },
  formSection:  { padding: Spacing.lg },
  formLabel:    { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.06 },
  clubSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 0.5, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, ...Shadow.sm },
  clubSelectorText: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  clubSelectorArrow:{ fontSize: Typography.base, color: Colors.textMuted },
  formHint:     { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: Spacing.md },

  // Club picker modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay50, justifyContent: 'flex-end' },
  pickerSheet:  { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, maxHeight: '60%' },
  pickerHandle: { width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  pickerTitle:  { fontSize: Typography.lg, fontWeight: Typography.semibold, marginBottom: Spacing.md },
  pickerItem:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  pickerItemSelected: { backgroundColor: Colors.greenLight, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm },
  pickerItemText: { fontSize: Typography.base, color: Colors.textPrimary },
  pickerItemTextSelected: { color: Colors.green, fontWeight: Typography.semibold },

  // Select options
  selectHero:    { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  selectTitle:   { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark },
  selectSub:     { fontSize: Typography.sm, color: Colors.textOnDarkDim, marginTop: 4 },
  selectOptions: { padding: Spacing.lg, gap: Spacing.md },
  optionCard:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 0.5, borderColor: Colors.border, gap: Spacing.sm, ...Shadow.sm },
  optionIcon:    { fontSize: 36 },
  optionTitle:   { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  optionDesc:    { fontSize: Typography.sm, color: Colors.textSecondary },
  tipBox:        { margin: Spacing.lg, backgroundColor: Colors.greenLight, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  tipTitle:      { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.green, marginBottom: Spacing.sm },
  tipText:       { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: Typography.sm * 1.7 },
});


