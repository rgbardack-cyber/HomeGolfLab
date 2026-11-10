/**
 * SwingIQ — Space Mapping Screen
 * =================================
 * Full replacement for the Space tab.
 *
 * TABS
 * ────
 *  🏠 Setup   — 3-step flow: scan room → photo equipment → view zone map
 *  📋 Today   — Daily practice plan: drill cards with built-in timers
 *  📊 History — Past sessions completed from this space
 *
 * SETUP FLOW
 * ──────────
 *  Step 1: SCAN — user pans phone around the room (records a short video)
 *  Step 2: EQUIP — user takes a photo of their gear (or manually ticks items)
 *  Step 3: MAP — AI-generated zone overlay + "Generate Today's Plan" CTA
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions, Switch, Modal, Pressable,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Rect, Circle, Text as SvgText, Line, G } from 'react-native-svg';

import { useAuthContext } from '@/components/AuthProvider';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/theme';

const { width: SW } = Dimensions.get('window');
const MAP_W = SW - Spacing.lg * 2;
const MAP_H = MAP_W * 0.65;

// ── API service (inline for this module) ─────────────────────────────────────

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

async function authFetch(endpoint: string, options: RequestInit = {}) {
  const { supabase } = await import('@/services/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(`${BASE}/api/v1/space${endpoint}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Zone {
  zone_type: string; label: string;
  x_norm: number;   y_norm: number;
  width_norm: number; height_norm: number;
  width_ft: number;   height_ft: number;
  feasibility: 'good' | 'ok' | 'tight';
}

interface RoomScan {
  estimated_width_ft: number;
  estimated_length_ft: number;
  estimated_height_ft: number;
  usable_area_sqft: number;
  floor_type: string;
  zones: Zone[];
  obstacle_regions: Array<{ x: number; y: number; w: number; h: number }>;
  scan_notes: string[];
  confidence: number;
}

interface Equipment {
  has_net: boolean; has_mat: boolean; has_putter: boolean;
  has_irons: boolean; has_driver: boolean;
  has_alignment_sticks: boolean; has_putting_cup: boolean;
  has_foam_balls: boolean; has_tees: boolean;
  enabled_drills: string[];
}

interface Drill {
  order: number; name: string; description: string;
  duration_min: number; reps_or_target: string;
  equipment: string[]; coaching_cue: string;
  difficulty: number; zone_type: string;
  is_warm_up: boolean; is_cool_down: boolean;
}

interface DailyPlan {
  plan_date: string; total_minutes: number;
  theme: string; intro: string;
  drills: Drill[];
  equipment_needed: string[];
  space_note: string;
}

type ActiveTab  = 'setup' | 'today' | 'history';
type SetupStep  = 'scan' | 'equip' | 'map';

const ZONE_COLORS: Record<string, string> = {
  putting_lane: Colors.greenMid,
  chip_zone:    Colors.gold,
  swing_zone:   '#4080d0',
  target_spot:  '#d04040',
};

const FEASIBILITY_COLORS: Record<string, string> = {
  good:  Colors.greenMid,
  ok:    Colors.gold,
  tight: Colors.severityFix,
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function SpaceScreen() {
  const { profile } = useAuthContext();
  const [tab,      setTab]      = useState<ActiveTab>('setup');
  const [step,     setStep]     = useState<SetupStep>('scan');
  const [room,     setRoom]     = useState<RoomScan | null>(null);
  const [equip,    setEquip]    = useState<Equipment | null>(null);
  const [plan,     setPlan]     = useState<DailyPlan | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [loadMsg,  setLoadMsg]  = useState('');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient colors={[Colors.dark, Colors.darkMid]} style={styles.header}>
        <Text style={styles.headerTitle}>Space Mapping</Text>
        <Text style={styles.headerSub}>
          {room ? `${room.estimated_width_ft}×${room.estimated_length_ft} ft · ${room.usable_area_sqft} sq ft usable` : 'Scan your practice space'}
        </Text>
      </LinearGradient>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['setup','today','history'] as ActiveTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabPill, tab === t && styles.tabPillActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabPillText, tab === t && styles.tabPillTextActive]}>
              {t === 'setup' ? '🏠 Setup' : t === 'today' ? '📋 Today' : '📊 History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={Colors.greenGlow} size="large" />
          <Text style={styles.loadingMsg}>{loadMsg}</Text>
        </View>
      )}

      {tab === 'setup'   && <SetupTab step={step} setStep={setStep} room={room} setRoom={setRoom} equip={equip} setEquip={setEquip} plan={plan} setPlan={setPlan} setLoading={setLoading} setLoadMsg={setLoadMsg} profile={profile} setTab={setTab} />}
      {tab === 'today'   && <TodayTab plan={plan} room={room} equip={equip} setPlan={setPlan} setLoading={setLoading} setLoadMsg={setLoadMsg} profile={profile} />}
      {tab === 'history' && <HistoryTab />}
    </SafeAreaView>
  );
}

// ── Setup Tab ─────────────────────────────────────────────────────────────────

function SetupTab({ step, setStep, room, setRoom, equip, setEquip, plan, setPlan, setLoading, setLoadMsg, profile, setTab }: any) {
  return (
    <ScrollView>
      {/* Step indicator */}
      <View style={styles.stepRow}>
        {['Scan Room', 'Equipment', 'Zone Map'].map((label, i) => {
          const stepKeys: SetupStep[] = ['scan','equip','map'];
          const active = step === stepKeys[i];
          const done   = stepKeys.indexOf(step) > i;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                <Text style={[styles.stepDotText, (done || active) && { color: '#fff' }]}>
                  {done ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
            </View>
          );
        })}
      </View>

      {step === 'scan'  && <ScanStep  setRoom={setRoom}  setStep={setStep}  setLoading={setLoading} setLoadMsg={setLoadMsg} />}
      {step === 'equip' && <EquipStep setEquip={setEquip} setStep={setStep} setLoading={setLoading} setLoadMsg={setLoadMsg} />}
      {step === 'map'   && <MapStep   room={room} equip={equip} plan={plan} setPlan={setPlan} setLoading={setLoading} setLoadMsg={setLoadMsg} profile={profile} setTab={setTab} />}
    </ScrollView>
  );
}

// ── Step 1: Scan ──────────────────────────────────────────────────────────────

function ScanStep({ setRoom, setStep, setLoading, setLoadMsg }: any) {
  const [recording, setRecording] = useState(false);
  const [recSecs,   setRecSecs]   = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval>>();
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  const startScan = async () => {
    if (!camPerm?.granted) { await requestCamPerm(); return; }
    if (!micPerm?.granted) { await requestMicPerm(); }
    setRecording(true);
    setRecSecs(0);
    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const video = await cameraRef.current?.recordAsync({ maxDuration: 20 });
      if (video?.uri) await submitScan(video.uri);
    } finally {
      clearInterval(timerRef.current);
      setRecording(false);
    }
  };

  const stopScan = () => {
    cameraRef.current?.stopRecording();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const submitScan = async (uri: string) => {
    setLoading(true);
    setLoadMsg('Analysing your space…');
    try {
      const form = new FormData();
      form.append('video', { uri, name: 'scan.mp4', type: 'video/mp4' } as any);
      const res  = await authFetch('/scan', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setRoom(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('equip');
    } catch (e: any) {
      Alert.alert('Scan failed', e.message ?? 'Could not analyse room. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Scan Your Space</Text>
      <Text style={styles.stepDesc}>Slowly pan your phone around the full room — floor, walls, and ceiling — in a single sweep. 10–20 seconds is ideal.</Text>

      <View style={styles.cameraBox}>
        {camPerm?.granted ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" mode="video">
            {recording && (
              <View style={styles.recBadge}>
                <View style={styles.recDot} />
                <Text style={styles.recTime}>{String(recSecs).padStart(2,'0')}s / 20s</Text>
              </View>
            )}
            {!recording && (
              <View style={styles.scanGuideOverlay}>
                <Text style={styles.scanGuideText}>Pan slowly around the room</Text>
              </View>
            )}
          </CameraView>
        ) : (
          <TouchableOpacity style={styles.cameraPermBtn} onPress={requestCamPerm}>
            <Text style={styles.cameraPermIcon}>📷</Text>
            <Text style={styles.cameraPermText}>Enable Camera</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.recordRow}>
        <TouchableOpacity
          style={[styles.recordBtn, recording && styles.recordBtnActive]}
          onPress={recording ? stopScan : startScan}
        >
          <View style={[styles.recordBtnInner, recording && styles.recordBtnStop]} />
        </TouchableOpacity>
        <Text style={styles.recordLabel}>
          {recording ? 'Tap to stop and analyse' : 'Tap to start scanning (max 20s)'}
        </Text>
      </View>

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>💡 Tips for a better scan</Text>
        <Text style={styles.tipText}>{'• Move slowly and steadily\n• Include walls, floor, and ceiling\n• Show any obstacles (furniture)\n• Good lighting helps accuracy'}</Text>
      </View>
    </View>
  );
}

// ── Step 2: Equipment ─────────────────────────────────────────────────────────

const EQUIP_ITEMS = [
  { key: 'has_net',              label: 'Hitting Net',         emoji: '🥅' },
  { key: 'has_mat',              label: 'Practice Mat',        emoji: '🟩' },
  { key: 'has_putter',           label: 'Putter',              emoji: '🏌️' },
  { key: 'has_irons',            label: 'Irons',               emoji: '⛳' },
  { key: 'has_driver',           label: 'Driver / Woods',      emoji: '💨' },
  { key: 'has_alignment_sticks', label: 'Alignment Sticks',    emoji: '📏' },
  { key: 'has_putting_cup',      label: 'Putting Cup / Target',emoji: '🎯' },
  { key: 'has_foam_balls',       label: 'Foam / Practice Balls',emoji: '🟠' },
  { key: 'has_tees',             label: 'Tees',                emoji: '📍' },
];

function EquipStep({ setEquip, setStep, setLoading, setLoadMsg }: any) {
  const [manual, setManual] = useState<Record<string, boolean>>(
    Object.fromEntries(EQUIP_ITEMS.map(e => [e.key, false]))
  );
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  const takePhoto = async () => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    setPhotoUri(res.assets[0].uri);
    setLoading(true);
    setLoadMsg('Detecting equipment…');
    try {
      const form = new FormData();
      form.append('photo', { uri: res.assets[0].uri, name: 'equip.jpg', type: 'image/jpeg' } as any);
      const apiRes = await authFetch('/equipment', { method: 'POST', body: form });
      if (!apiRes.ok) throw new Error(`${apiRes.status}`);
      const data   = await apiRes.json();
      // Merge AI detections into manual toggles
      const merged: Record<string, boolean> = { ...manual };
      for (const key of Object.keys(manual)) {
        if (data[key]) merged[key] = true;
      }
      setManual(merged);
      setDetected(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Photo detection failed — just use manual toggles
    } finally {
      setLoading(false);
    }
  };

  const proceed = () => {
    const drills: string[] = ['putting'];
    if (manual.has_mat || manual.has_irons) drills.push('chipping');
    if (manual.has_net && (manual.has_mat || manual.has_irons)) drills.push('full_swing');
    if (manual.has_alignment_sticks) drills.push('alignment_drill');
    if (manual.has_foam_balls) drills.push('indoor_chipping');

    setEquip({ ...manual, enabled_drills: [...new Set(drills)], items: [] });
    setStep('map');
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What do you have?</Text>
      <Text style={styles.stepDesc}>Take a photo of your gear and the AI will detect it — or toggle items manually below.</Text>

      <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
        <Text style={styles.photoBtnIcon}>📸</Text>
        <Text style={styles.photoBtnText}>{detected ? 'Re-scan Equipment' : 'Photo-detect Equipment'}</Text>
        {detected && <Text style={styles.photoBtnBadge}>AI detected ✓</Text>}
      </TouchableOpacity>

      <View style={styles.equipList}>
        {EQUIP_ITEMS.map(item => (
          <View key={item.key} style={styles.equipRow}>
            <Text style={styles.equipEmoji}>{item.emoji}</Text>
            <Text style={styles.equipLabel}>{item.label}</Text>
            <Switch
              value={manual[item.key]}
              onValueChange={v => setManual(prev => ({ ...prev, [item.key]: v }))}
              trackColor={{ true: Colors.green }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.proceedBtn} onPress={proceed}>
        <Text style={styles.proceedBtnText}>Generate Zone Map →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Step 3: Zone Map ──────────────────────────────────────────────────────────

function MapStep({ room, equip, plan, setPlan, setLoading, setLoadMsg, profile, setTab }: any) {
  const generatePlan = async () => {
    if (!room || !equip) return;
    setLoading(true);
    setLoadMsg('Claude is building your plan…');
    try {
      const res  = await authFetch('/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room, equipment: equip,
          skill_level:     profile?.skill_level ?? 'intermediate',
          handicap:        profile?.handicap ?? null,
          recent_feedback: [],
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setPlan(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTab('today');
    } catch (e: any) {
      Alert.alert('Could not generate plan', e.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!room) return <View style={styles.stepContent}><Text style={styles.stepDesc}>Complete the room scan first.</Text></View>;

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Your Practice Zones</Text>
      <Text style={styles.stepDesc}>
        {room.estimated_width_ft}×{room.estimated_length_ft} ft · {room.estimated_height_ft} ft ceiling · {room.usable_area_sqft} sq ft usable
      </Text>

      {/* Zone map SVG */}
      <View style={styles.mapContainer}>
        <LinearGradient colors={[Colors.dark, Colors.darkCard]} style={styles.mapBg}>
          <ZoneMapSvg room={room} width={MAP_W} height={MAP_H} />
        </LinearGradient>
      </View>

      {/* Zone legend */}
      <View style={styles.legendRow}>
        {Object.entries(ZONE_COLORS).map(([type, color]) => (
          <View key={type} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{type.replace('_',' ')}</Text>
          </View>
        ))}
      </View>

      {/* Scan notes */}
      {room.scan_notes?.length > 0 && (
        <View style={styles.notesCard}>
          <Text style={styles.notesTitle}>📋 AI Observations</Text>
          {room.scan_notes.map((note: string, i: number) => (
            <Text key={i} style={styles.noteText}>• {note}</Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.generateBtn} onPress={generatePlan}>
        <Text style={styles.generateBtnText}>✨ Generate Today's Plan</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Zone Map SVG ──────────────────────────────────────────────────────────────

function ZoneMapSvg({ room, width, height }: { room: RoomScan; width: number; height: number }) {
  const PADDING = 12;
  const usableW = width  - PADDING * 2;
  const usableH = height - PADDING * 2;

  return (
    <Svg width={width} height={height}>
      {/* Room outline */}
      <Rect x={PADDING} y={PADDING} width={usableW} height={usableH}
        fill="none" stroke="rgba(109,207,142,0.4)" strokeWidth={1.5} rx={4} />

      {/* Obstacles */}
      {room.obstacle_regions?.map((obs: any, i: number) => (
        <Rect key={i}
          x={PADDING + obs.x * usableW} y={PADDING + obs.y * usableH}
          width={obs.w * usableW} height={obs.h * usableH}
          fill="rgba(208,64,64,0.2)" stroke="rgba(208,64,64,0.4)" strokeWidth={0.5} rx={2}
        />
      ))}

      {/* Practice zones */}
      {room.zones?.map((zone: Zone, i: number) => {
        const color = ZONE_COLORS[zone.zone_type] ?? Colors.greenMid;
        const zx = PADDING + (zone.x_norm - zone.width_norm/2)  * usableW;
        const zy = PADDING + (zone.y_norm - zone.height_norm/2) * usableH;
        const zw = zone.width_norm  * usableW;
        const zh = zone.height_norm * usableH;

        if (zone.zone_type === 'target_spot') {
          return (
            <G key={i}>
              <Circle cx={PADDING + zone.x_norm * usableW} cy={PADDING + zone.y_norm * usableH}
                r={8} fill={`${color}55`} stroke={color} strokeWidth={1} />
              <Circle cx={PADDING + zone.x_norm * usableW} cy={PADDING + zone.y_norm * usableH}
                r={3} fill={color} />
            </G>
          );
        }

        return (
          <G key={i}>
            <Rect x={zx} y={zy} width={zw} height={zh}
              fill={`${color}25`} stroke={`${color}80`}
              strokeWidth={1} strokeDasharray={zone.feasibility === 'tight' ? '4 3' : undefined} rx={4} />
            <SvgText x={zx + zw/2} y={zy + zh/2 + 4}
              fill={color} fontSize={9} fontWeight="600" textAnchor="middle">
              {zone.label}
            </SvgText>
            <SvgText x={zx + zw/2} y={zy + zh/2 + 15}
              fill="rgba(255,255,255,0.4)" fontSize={7} textAnchor="middle">
              {zone.width_ft}×{zone.height_ft}ft
            </SvgText>
          </G>
        );
      })}

      {/* Labels */}
      <SvgText x={PADDING + 4} y={PADDING + 12} fill="rgba(255,255,255,0.3)" fontSize={8}>
        {room.estimated_width_ft}ft wide
      </SvgText>
      <SvgText x={PADDING + 4} y={height - 6} fill="rgba(255,255,255,0.3)" fontSize={8}>
        {room.estimated_length_ft}ft long
      </SvgText>
    </Svg>
  );
}

// ── Today Tab ─────────────────────────────────────────────────────────────────

function TodayTab({ plan, room, equip, setPlan, setLoading, setLoadMsg, profile }: any) {
  if (!plan) {
    return (
      <View style={styles.emptyTab}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>No plan yet</Text>
        <Text style={styles.emptySub}>Complete the Setup tab to generate your personalised daily plan</Text>
      </View>
    );
  }

  return (
    <ScrollView>
      {/* Plan header */}
      <LinearGradient colors={['#0f2d1a','#1a4d2e']} style={styles.planHero}>
        <Text style={styles.planTheme}>{plan.theme}</Text>
        <Text style={styles.planIntro}>{plan.intro}</Text>
        <View style={styles.planMeta}>
          <Text style={styles.planMetaText}>⏱ {plan.total_minutes} min</Text>
          <Text style={styles.planMetaText}>📅 {plan.plan_date}</Text>
          <Text style={styles.planMetaText}>🏠 {plan.space_note}</Text>
        </View>
      </LinearGradient>

      {/* Drill cards */}
      <View style={styles.drillList}>
        {plan.drills.map((drill: Drill) => (
          <DrillCard key={drill.order} drill={drill} />
        ))}
      </View>

      <View style={{ height: Spacing.xxxl }} />
    </ScrollView>
  );
}

// ── Drill Card ────────────────────────────────────────────────────────────────

function DrillCard({ drill }: { drill: Drill }) {
  const [expanded,  setExpanded]  = useState(false);
  const [timerSecs, setTimerSecs] = useState(drill.duration_min * 60);
  const [running,   setRunning]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const toggleTimer = () => {
    if (running) {
      clearInterval(timerRef.current);
      setRunning(false);
    } else {
      if (timerSecs === 0) setTimerSecs(drill.duration_min * 60);
      setRunning(true);
      timerRef.current = setInterval(() => {
        setTimerSecs(s => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setRunning(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
  };

  const resetTimer = () => {
    clearInterval(timerRef.current);
    setRunning(false);
    setTimerSecs(drill.duration_min * 60);
  };

  const mins = Math.floor(timerSecs / 60);
  const secs = timerSecs % 60;
  const progress = 1 - timerSecs / (drill.duration_min * 60);

  const tagColor = drill.is_warm_up ? Colors.gold
    : drill.is_cool_down ? '#6090d0'
    : ZONE_COLORS[drill.zone_type] ?? Colors.green;

  return (
    <TouchableOpacity
      style={[styles.drillCard, drill.is_warm_up && styles.drillCardWarmup, drill.is_cool_down && styles.drillCardCooldown]}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={styles.drillHeader}>
        <View style={[styles.drillNum, { backgroundColor: tagColor }]}>
          <Text style={styles.drillNumText}>{drill.order}</Text>
        </View>
        <View style={styles.drillTitleWrap}>
          <Text style={styles.drillName}>{drill.name}</Text>
          <View style={styles.drillMeta}>
            <Text style={styles.drillMetaText}>{drill.duration_min} min</Text>
            <Text style={styles.drillMetaDot}>·</Text>
            <Text style={styles.drillMetaText}>{drill.reps_or_target}</Text>
            {drill.is_warm_up   && <Text style={[styles.drillTag, { backgroundColor: Colors.goldLight, color: Colors.gold }]}>Warm-up</Text>}
            {drill.is_cool_down && <Text style={[styles.drillTag, { backgroundColor: '#eef4ff', color: '#4060a0' }]}>Cool-down</Text>}
          </View>
        </View>
        <Text style={styles.drillChevron}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.drillBody}>
          <Text style={styles.drillDesc}>{drill.description}</Text>

          {/* Coaching cue */}
          <View style={styles.cueBox}>
            <Text style={styles.cueLabel}>💡 KEY CUE</Text>
            <Text style={styles.cueText}>{drill.coaching_cue}</Text>
          </View>

          {/* Equipment needed */}
          {drill.equipment?.length > 0 && (
            <Text style={styles.drillEquip}>
              Needs: {drill.equipment.join(', ')}
            </Text>
          )}

          {/* Difficulty dots */}
          <View style={styles.diffRow}>
            <Text style={styles.diffLabel}>Difficulty</Text>
            {[1,2,3,4,5].map(d => (
              <View key={d} style={[styles.diffDot, d <= drill.difficulty && { backgroundColor: tagColor }]} />
            ))}
          </View>

          {/* Timer */}
          <View style={styles.timerRow}>
            <View style={styles.timerDisplay}>
              <Text style={[styles.timerTime, running && { color: tagColor }]}>
                {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
              </Text>
              {/* Progress bar */}
              <View style={styles.timerTrack}>
                <View style={[styles.timerFill, { width: `${progress * 100}%`, backgroundColor: tagColor }]} />
              </View>
            </View>
            <TouchableOpacity style={[styles.timerBtn, { backgroundColor: tagColor }]} onPress={toggleTimer}>
              <Text style={styles.timerBtnText}>{running ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.timerResetBtn} onPress={resetTimer}>
              <Text style={styles.timerResetText}>↺</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  return (
    <View style={styles.emptyTab}>
      <Text style={styles.emptyIcon}>📊</Text>
      <Text style={styles.emptyTitle}>Practice history</Text>
      <Text style={styles.emptySub}>Completed sessions will appear here once you start following the daily plans</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { padding: Spacing.lg, paddingTop: Spacing.xl },
  headerTitle: { fontSize: Typography.xxl, fontWeight: Typography.bold, color: Colors.textOnDark },
  headerSub:   { fontSize: Typography.xs, color: Colors.textOnDarkDim, marginTop: 2 },

  tabBar:          { flexDirection: 'row', padding: Spacing.sm, gap: 6, backgroundColor: Colors.surface, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  tabPill:         { flex: 1, paddingVertical: 7, borderRadius: Radius.full, alignItems: 'center', backgroundColor: Colors.background },
  tabPillActive:   { backgroundColor: Colors.green },
  tabPillText:     { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  tabPillTextActive: { color: '#fff', fontWeight: Typography.bold },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,26,18,0.85)', zIndex: 99, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingMsg:     { fontSize: Typography.base, color: Colors.textOnDark, fontWeight: Typography.medium },

  stepRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.xl },
  stepItem:        { alignItems: 'center', gap: 4 },
  stepDot:         { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive:   { backgroundColor: Colors.green, borderColor: Colors.green },
  stepDotDone:     { backgroundColor: Colors.greenMid, borderColor: Colors.greenMid },
  stepDotText:     { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textSecondary },
  stepLabel:       { fontSize: 10, color: Colors.textSecondary },
  stepLabelActive: { color: Colors.green, fontWeight: Typography.semibold },

  stepContent: { padding: Spacing.lg },
  stepTitle:   { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  stepDesc:    { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.lg },

  cameraBox:      { height: 200, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.dark, marginBottom: Spacing.md },
  cameraPermBtn:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  cameraPermIcon: { fontSize: 36 },
  cameraPermText: { fontSize: Typography.sm, color: Colors.textOnDarkDim },
  recBadge:       { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  recDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ff4040' },
  recTime:        { fontSize: Typography.xs, color: '#fff', fontWeight: '600' },
  scanGuideOverlay: { position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center' },
  scanGuideText:  { fontSize: Typography.xs, color: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full },
  recordRow:      { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  recordBtn:      { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#ff4040', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,64,64,0.1)' },
  recordBtnActive:{ backgroundColor: 'rgba(255,64,64,0.25)' },
  recordBtnInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ff4040' },
  recordBtnStop:  { borderRadius: 5, width: 22, height: 22 },
  recordLabel:    { fontSize: Typography.xs, color: Colors.textSecondary },

  tipCard:  { backgroundColor: Colors.greenLight, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border },
  tipTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.green, marginBottom: Spacing.sm },
  tipText:  { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  photoBtn:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, marginBottom: Spacing.lg, ...Shadow.sm },
  photoBtnIcon:   { fontSize: 24 },
  photoBtnText:   { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  photoBtnBadge:  { fontSize: Typography.xs, color: Colors.green, fontWeight: Typography.semibold },
  equipList:      { gap: 0, backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: Colors.border, ...Shadow.sm },
  equipRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  equipEmoji:     { fontSize: 20 },
  equipLabel:     { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  proceedBtn:     { marginTop: Spacing.lg, backgroundColor: Colors.green, borderRadius: Radius.md, padding: Spacing.md + 2, alignItems: 'center' },
  proceedBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },

  mapContainer: { borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.md },
  mapBg:        { padding: 1, borderRadius: Radius.lg },
  legendRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 10, height: 10, borderRadius: 2 },
  legendText:   { fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize' },
  notesCard:    { backgroundColor: Colors.greenLight, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 0.5, borderColor: Colors.border, marginBottom: Spacing.md },
  notesTitle:   { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.green, marginBottom: Spacing.sm },
  noteText:     { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18, marginBottom: 2 },
  generateBtn:  { backgroundColor: Colors.green, borderRadius: Radius.md, padding: Spacing.md + 2, alignItems: 'center', ...Shadow.md },
  generateBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },

  planHero:   { padding: Spacing.lg, margin: Spacing.lg, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: 'rgba(109,207,142,0.2)' },
  planTheme:  { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.greenGlow, marginBottom: Spacing.sm },
  planIntro:  { fontSize: Typography.sm, color: Colors.textOnDarkDim, lineHeight: 20, marginBottom: Spacing.md },
  planMeta:   { gap: 4 },
  planMetaText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.45)' },
  drillList:  { paddingHorizontal: Spacing.lg, gap: Spacing.sm },

  drillCard:        { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  drillCardWarmup:  { borderColor: `${Colors.gold}44` },
  drillCardCooldown:{ borderColor: '#4060a044' },
  drillHeader:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  drillNum:         { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  drillNumText:     { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },
  drillTitleWrap:   { flex: 1 },
  drillName:        { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  drillMeta:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  drillMetaText:    { fontSize: Typography.xs, color: Colors.textMuted },
  drillMetaDot:     { fontSize: Typography.xs, color: Colors.textMuted },
  drillTag:         { fontSize: 9, fontWeight: Typography.semibold, paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full },
  drillChevron:     { fontSize: 10, color: Colors.textMuted },
  drillBody:        { padding: Spacing.md, borderTopWidth: 0.5, borderTopColor: Colors.border, gap: Spacing.sm },
  drillDesc:        { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  cueBox:           { backgroundColor: Colors.greenLight, borderRadius: Radius.sm, padding: Spacing.sm },
  cueLabel:         { fontSize: 9, fontWeight: Typography.bold, color: Colors.green, letterSpacing: 0.06, marginBottom: 2 },
  cueText:          { fontSize: Typography.sm, color: Colors.textPrimary },
  drillEquip:       { fontSize: Typography.xs, color: Colors.textSecondary },
  diffRow:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  diffLabel:        { fontSize: Typography.xs, color: Colors.textMuted, marginRight: 4 },
  diffDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  timerRow:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  timerDisplay:     { flex: 1 },
  timerTime:        { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  timerTrack:       { height: 3, backgroundColor: Colors.border, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  timerFill:        { height: '100%', borderRadius: 2 },
  timerBtn:         { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  timerBtnText:     { fontSize: 16, color: '#fff' },
  timerResetBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: Colors.border },
  timerResetText:   { fontSize: 16, color: Colors.textSecondary },

  emptyTab:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl },
  emptyIcon: { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle:{ fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  emptySub:  { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
