import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Loader2, Play, Square, RotateCcw, Target, Zap,
  Clock, Lock, Crown, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSubscription } from '@/lib/useSubscription';
import { Link } from 'react-router-dom';
import ShotResultCard from '@/components/tracking/ShotResultCard';
import SessionSummary from '@/components/tracking/SessionSummary';
import DispersionMap from '@/components/tracking/DispersionMap';
import AdvancedAnalytics from '@/components/tracking/AdvancedAnalytics';
import { useLang } from '@/lib/i18n.jsx';

const CLUBS = [
  { value: 'driver', label: 'Driver', number: null },
  { value: 'wood3', label: '3 Madera', number: '3' },
  { value: 'wood5', label: '5 Madera', number: '5' },
  { value: 'hybrid', label: 'Híbrido', number: 'H' },
  { value: 'iron4', label: '4 Hierro', number: '4' },
  { value: 'iron5', label: '5 Hierro', number: '5' },
  { value: 'iron6', label: '6 Hierro', number: '6' },
  { value: 'iron7', label: '7 Hierro', number: '7' },
  { value: 'iron8', label: '8 Hierro', number: '8' },
  { value: 'iron9', label: '9 Hierro', number: '9' },
  { value: 'pw', label: 'PW', number: 'PW' },
  { value: 'sw', label: 'SW', number: 'SW' },
  { value: 'lw', label: 'LW', number: 'LW' },
  { value: 'putter', label: 'Putter', number: 'P' },
];

// Session duration options in minutes
const SESSION_DURATIONS = [
  { value: 30, label: '30 min', free: true },
  { value: 60, label: '1 hora', free: false },
  { value: 90, label: '1.5 horas', free: false },
  { value: 120, label: '2 horas', free: false },
];

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function BallTracking() {
  const { t } = useLang();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedClub, setSelectedClub] = useState('iron7');
  const [shots, setShots] = useState([]);
  const [cameraError, setCameraError] = useState(null);
  const [capturedFrame, setCapturedFrame] = useState(null);

  // Session timer
  const [sessionDuration, setSessionDuration] = useState(30); // minutes
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState(0); // seconds
  const [sessionEnded, setSessionEnded] = useState(false);

  // Club detection mode
  const [detectingClub, setDetectingClub] = useState(false);
  const [clubDetected, setClubDetected] = useState(null); // { label, confidence }

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { isPremium } = useSubscription(user?.email);

  const sessionLimitSeconds = sessionDuration * 60;

  // Timer logic
  useEffect(() => {
    if (sessionActive && !sessionEnded) {
      timerRef.current = setInterval(() => {
        setSessionElapsed(prev => {
          const next = prev + 1;
          if (next >= sessionLimitSeconds) {
            clearInterval(timerRef.current);
            setSessionEnded(true);
            setSessionActive(false);
            stopCamera();
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [sessionActive, sessionEnded, sessionLimitSeconds]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setSessionActive(true);
      setSessionEnded(false);
      setSessionElapsed(0);
    } catch {
      setCameraError(t('cameraError'));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    clearInterval(timerRef.current);
    setCameraActive(false);
    setSessionActive(false);
  };

  useEffect(() => () => { stopCamera(); }, []);

  // Detect club from camera frame
  const detectClubFromCamera = async () => {
    if (!videoRef.current || analyzing) return;
    setDetectingClub(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'club.jpg', { type: 'image/jpeg' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Eres un sistema de reconocimiento de palos de golf. El usuario está mostrando la cabeza o el shaft de su palo a la cámara.
      Identifica el número/tipo del palo visible en la imagen. Busca números o letras grabados en la cabeza del palo como: 3, 4, 5, 6, 7, 8, 9, PW, SW, LW, P (putter), W (madera), H (híbrido), o "Driver".
      Si no ves claramente un palo, devuelve null.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          detected: { type: "boolean" },
          club_number: { type: "string", description: "e.g. '7', 'PW', 'Driver', 'SW'" },
          club_value: { type: "string", description: "One of: driver,wood3,wood5,hybrid,iron4,iron5,iron6,iron7,iron8,iron9,pw,sw,lw,putter" },
          confidence: { type: "number", description: "0-1 confidence score" },
        }
      }
    });

    if (result.detected && result.club_value) {
      const found = CLUBS.find(c => c.value === result.club_value);
      if (found) {
        setSelectedClub(result.club_value);
        setClubDetected({ label: found.label, confidence: result.confidence });
        setTimeout(() => setClubDetected(null), 4000);
      }
    }
    setDetectingClub(false);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || analyzing || sessionEnded) return;
    setAnalyzing(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedFrame(dataUrl);

    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const clubLabel = CLUBS.find(c => c.value === selectedClub)?.label || selectedClub;
    const shotNum = shots.length + 1;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Eres un sistema de shot tracking para golf tipo Trackman/FlightScope usando visión por computadora.
      Palo: ${clubLabel} | Tiro #${shotNum} de la sesión.
      
      Analiza la imagen del tiro. Estima parámetros realistas basados en el palo seleccionado y cualquier indicio visual.
      Proporciona datos de tracking REALISTAS para el palo ${clubLabel}:
      - Distancia carry típica para ese palo (con variación realista)
      - Velocidad de bola estimada (mph y kph)  
      - Altura máxima (metros y pies)
      - Trayectoria lateral (draw/fade/straight/hook/slice/pull/push)
      - Calidad del tiro 1-10
      - Desviación lateral en metros desde el centro (positivo=derecha, negativo=izquierda)
      - Un tip corto en español`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          trajectory: { type: "string" },
          distance_yards: { type: "number" },
          distance_meters: { type: "number" },
          direction: { type: "string" },
          ball_speed_mph: { type: "number" },
          ball_speed_kph: { type: "number" },
          max_height_meters: { type: "number" },
          max_height_feet: { type: "number" },
          launch_angle: { type: "number", description: "degrees" },
          lateral_deviation_meters: { type: "number", description: "positive=right, negative=left" },
          quality_score: { type: "number" },
          tip: { type: "string" },
          club: { type: "string" },
        }
      }
    });

    result.club = clubLabel;
    result.club_value = selectedClub;
    result.shot_number = shotNum;
    setShots(prev => [...prev, result]);

    await base44.entities.PracticeSession.create({
      type: 'ball_tracking',
      date: new Date().toISOString().split('T')[0],
      ai_analysis: JSON.stringify(result),
      score: result.quality_score,
      notes: `Palo: ${result.club} | Sesión ${Math.ceil(sessionElapsed / 60)} min`,
    });

    setAnalyzing(false);
    setCapturedFrame(null);
  };

  const resetSession = () => {
    setShots([]);
    setSessionEnded(false);
    setSessionElapsed(0);
    setCapturedFrame(null);
  };

  const timeLeft = sessionLimitSeconds - sessionElapsed;
  const progressPct = (sessionElapsed / sessionLimitSeconds) * 100;

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-chart-4/20 flex items-center justify-center">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">{t('shotTracker')}</h1>
            <p className="text-sm text-muted-foreground">{t('shotTrackerSubtitle')}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-heading font-bold text-primary">{shots.length}</p>
            <p className="text-xs text-muted-foreground">{t('shots')}</p>
          </div>
        </div>
      </motion.div>

      {/* Session Duration Picker (before start) */}
      {!cameraActive && !sessionEnded && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-medium">{t('sessionDuration')}</p>
          <div className="grid grid-cols-4 gap-2">
            {SESSION_DURATIONS.map(opt => {
              const locked = !opt.free && !isPremium;
              return (
                <button
                  key={opt.value}
                  disabled={locked}
                  onClick={() => !locked && setSessionDuration(opt.value)}
                  className={`relative p-3 rounded-xl border-2 text-center transition-all ${
                    sessionDuration === opt.value && !locked
                      ? 'border-primary bg-primary/10'
                      : locked
                      ? 'border-border bg-muted opacity-60 cursor-not-allowed'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {locked && <Lock className="absolute top-1.5 right-1.5 w-3 h-3 text-muted-foreground" />}
                  <p className="text-xs font-semibold">{opt.label}</p>
                </button>
              );
            })}
          </div>
          {!isPremium && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
              <Crown className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>{t('premiumSessions')}</span>
              <Link to="/subscription" className="text-primary font-medium ml-auto shrink-0">{t('seePlans')}</Link>
            </div>
          )}
        </div>
      )}

      {/* Camera View */}
      <div className="bg-black rounded-2xl overflow-hidden aspect-video relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
        />
        <canvas ref={canvasRef} className="hidden" />

        {!cameraActive && !sessionEnded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <p className="text-white/70 text-sm">{t('cameraOff')}</p>
            <Button onClick={startCamera} variant="secondary" className="gap-2">
              <Play className="w-4 h-4" /> {t('startSession')} ({sessionDuration} min)
            </Button>
            {cameraError && <p className="text-destructive text-sm text-center px-4">{cameraError}</p>}
          </div>
        )}

        {sessionEnded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70">
            <CheckCircle2 className="w-14 h-14 text-primary" />
            <p className="text-white text-lg font-heading font-bold">{t('sessionComplete')}</p>
            <p className="text-white/70 text-sm">{shots.length} {t('shotsRegistered')}</p>
          </div>
        )}

        {cameraActive && (
          <>
            {/* Live indicator */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-medium">{t('liveLabel')}</span>
            </div>

            {/* Timer */}
            <div className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1 backdrop-blur-sm ${timeLeft < 120 ? 'bg-destructive/70' : 'bg-black/50'}`}>
              <Clock className="w-3.5 h-3.5 text-white" />
              <span className="text-white text-xs font-bold">{formatTime(timeLeft)}</span>
            </div>

            {/* Club detected badge */}
            <AnimatePresence>
              {clubDetected && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground rounded-full px-4 py-2 text-sm font-bold flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t('clubDetectedLabel')} {clubDetected.label}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Analyzing overlay */}
            {analyzing && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="bg-card rounded-xl p-4 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm font-medium">{t('analyzingShot')}</span>
                </div>
              </div>
            )}

            {/* Captured flash */}
            <AnimatePresence>
              {capturedFrame && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/20" />
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Progress bar */}
      {(cameraActive || sessionEnded) && (
        <div className="space-y-1">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${progressPct > 85 ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.floor(sessionElapsed / 60)} {t('minElapsed')}</span>
            <span>{sessionDuration} {t('minTotal')}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      {cameraActive && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">{t('activeClub')}</Label>
              <Select value={selectedClub} onValueChange={setSelectedClub}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLUBS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={detectClubFromCamera}
                disabled={detectingClub || analyzing}
                className="gap-1.5 text-xs h-9"
              >
                {detectingClub ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {detectingClub ? t('detecting') : t('detectClub')}
              </Button>
              <Button variant="outline" onClick={stopCamera} size="sm" className="gap-1.5 text-xs h-9 text-destructive border-destructive/30">
                <Square className="w-3.5 h-3.5" /> {t('stop')}
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-center bg-muted/50 rounded-lg px-3 py-2">
            💡 <span dangerouslySetInnerHTML={{ __html: t('detectClubHint') }} />
          </p>

          {/* Track Shot Button */}
          <button
            onClick={captureAndAnalyze}
            disabled={analyzing || sessionEnded}
            className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-lg flex items-center justify-center gap-3 hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 shadow-lg"
          >
            {analyzing ? (
              <><Loader2 className="w-6 h-6 animate-spin" /> {t('analyzing')}</>
            ) : (
              <><Zap className="w-6 h-6" /> {t('registerShot')}</>
            )}
          </button>
        </motion.div>
      )}

      {/* Post-session actions */}
      {sessionEnded && shots.length > 0 && (
        <div className="flex gap-3">
          <Button onClick={resetSession} variant="outline" className="flex-1 gap-2">
            <RotateCcw className="w-4 h-4" /> {t('newSession')}
          </Button>
          <Button onClick={startCamera} className="flex-1 gap-2">
            <Play className="w-4 h-4" /> {t('extraSession')}
          </Button>
        </div>
      )}

      {/* Session Summary */}
      <SessionSummary shots={shots} sessionElapsed={sessionElapsed} />

      {/* Dispersion Map — appears after 3+ shots */}
      {shots.length >= 3 && <DispersionMap shots={shots} />}

      {/* Shot History */}
      {shots.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-semibold">{t('shotsCount')} ({shots.length})</h3>
            <button onClick={resetSession} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> {t('clear')}
            </button>
          </div>
          <div className="space-y-2">
            {[...shots].reverse().map((shot, i) => (
              <ShotResultCard key={i} shot={shot} index={shots.length - 1 - i} />
            ))}
          </div>
        </div>
      )}

      {/* Advanced Analytics — Premium only */}
      {isPremium && <AdvancedAnalytics userEmail={user?.email} />}

      {/* Instructions */}
      {!cameraActive && !sessionEnded && shots.length === 0 && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <h3 className="font-heading font-semibold">{t('howToUse')}</h3>
          <ol className="space-y-2 text-sm text-muted-foreground">
            {[t('howStep1'), t('howStep2'), t('howStep3'), t('howStep4'), t('howStep5')].map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}