import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * AdModal — simulates a mandatory ad the user MUST watch.
 * - countdown: seconds the user must wait before closing
 * - onComplete: called when the ad finishes or timer expires
 * - We detect visibility change: if user leaves the app, we pause the timer
 *   and show a warning when they return (simulating anti-skip behavior)
 */
export default function AdModal({ isOpen, onComplete, durationSeconds = 60, title = 'Anuncio' }) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [paused, setPaused] = useState(false);
  const [skippedWarning, setSkippedWarning] = useState(false);
  const intervalRef = useRef(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setSecondsLeft(durationSeconds);
      setPaused(false);
      setSkippedWarning(false);
    }
  }, [isOpen, durationSeconds]);

  // Countdown
  useEffect(() => {
    if (!isOpen) return;
    if (paused) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [isOpen, paused, onComplete]);

  // Anti-skip: detect tab/app switch
  useEffect(() => {
    if (!isOpen) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setPaused(true);
        clearInterval(intervalRef.current);
      } else {
        setSkippedWarning(true);
        setPaused(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isOpen]);

  const progress = ((durationSeconds - secondsLeft) / durationSeconds) * 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
        >
          {skippedWarning && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-4 left-4 right-4 bg-red-600 text-white text-center rounded-xl p-3 text-sm font-medium"
            >
              ⚠️ Detectamos que saliste de la app. El anuncio se pausó. ¡Debes verlo completo!
            </motion.div>
          )}

          {/* Ad placeholder */}
          <div className="w-full max-w-lg mx-4 bg-gray-900 rounded-2xl overflow-hidden">
            <div className="aspect-video bg-gradient-to-br from-green-900 to-green-700 flex flex-col items-center justify-center relative">
              <div className="text-white/40 text-6xl mb-4">📺</div>
              <p className="text-white/60 text-lg font-medium">Patrocinado</p>
              <p className="text-white/40 text-sm mt-1">HomeGolf LAB — Tu mejor herramienta de golf</p>

              {/* Timer badge */}
              <div className="absolute top-3 right-3 bg-black/70 text-white text-xs px-3 py-1 rounded-full font-mono">
                {secondsLeft}s
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-700">
              <motion.div
                className="h-full bg-green-500"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">{title}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {paused ? '⏸ Pausado — regresa a la app' : `Espera ${secondsLeft} segundos...`}
                </p>
              </div>
              <div className="text-gray-500 text-xs text-right">
                <p>Mejora a Premium</p>
                <p className="text-green-400">sin anuncios</p>
              </div>
            </div>
          </div>

          <p className="text-gray-600 text-xs mt-6 text-center px-8">
            No puedes cerrar este anuncio hasta que termine. Sal de los anuncios con una suscripción Premium.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}