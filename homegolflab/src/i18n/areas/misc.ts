/**
 * Área «misc»: textos sueltos: progreso, etiquetas de guías y mensajes del coach. Claves guide.*, coach.* y algunas sw2/vf2/cv2/vr2.
 * Idiomas incluidos aquí: es, en, pt, de. Los demás caen en inglés hasta traducirse (ver PENDING_AREAS en `i18n.test.ts`). Borrador de IA, sin revisión nativa.
 */
import type { Area } from './index';

export const misc: Area = {
  es: {
    "sw2.analyzing": "Analizando… {p}%",
    "vf2.following": "Siguiendo… {p}%",
    "cv2.frameA": "cuadro A {n}",
    "vr2.frameLine": "cuadro {n} · {s} s",
    "guide.head": "Cabeza",
    "guide.torso": "Torso",
    "guide.leadArm": "Brazo guía",
    "guide.hips": "Caderas",
    "coach.offline": "No hay conexión con el coach con IA. Revisa tu internet.",
    "coach.notConfigured": "Esta versión de prueba no incluye el coach con IA.",
    "coach.failed": "El análisis con IA falló. Inténtalo de nuevo.",
    "coach.quota": "Ya usaste todos los análisis de este mes. Se reinician el primer día del mes que viene.",
  },
  en: {
    "sw2.analyzing": "Analyzing… {p}%",
    "vf2.following": "Following… {p}%",
    "cv2.frameA": "frame A {n}",
    "vr2.frameLine": "frame {n} · {s} s",
    "guide.head": "Head",
    "guide.torso": "Torso",
    "guide.leadArm": "Lead arm",
    "guide.hips": "Hips",
    "coach.offline": "No connection to the AI coach. Check your internet.",
    "coach.notConfigured": "This test version does not include the AI coach.",
    "coach.failed": "The AI analysis failed. Try again.",
    "coach.quota": "You have used all of this month’s analyses. They reset on the first day of next month.",
  },
  pt: {
    "sw2.analyzing": "A analisar… {p}%",
    "vf2.following": "A seguir… {p}%",
    "cv2.frameA": "imagem A {n}",
    "vr2.frameLine": "imagem {n} · {s} s",
    "guide.head": "Cabeça",
    "guide.torso": "Tronco",
    "guide.leadArm": "Braço guia",
    "guide.hips": "Ancas",
    "coach.offline": "Sem ligação ao coach com IA. Verifica a tua internet.",
    "coach.notConfigured": "Esta versão de teste não inclui o coach com IA.",
    "coach.failed": "A análise com IA falhou. Tenta de novo.",
    "coach.quota": "Já usaste todas as análises deste mês. Reiniciam no primeiro dia do mês seguinte.",
  },
  de: {
    "sw2.analyzing": "Wird analysiert… {p}%",
    "vf2.following": "Wird verfolgt… {p}%",
    "cv2.frameA": "Bild A {n}",
    "vr2.frameLine": "Bild {n} · {s} s",
    "guide.head": "Kopf",
    "guide.torso": "Rumpf",
    "guide.leadArm": "Führungsarm",
    "guide.hips": "Hüften",
    "coach.offline": "Keine Verbindung zum KI-Coach. Prüfe dein Internet.",
    "coach.notConfigured": "Diese Testversion enthält den KI-Coach nicht.",
    "coach.failed": "Die KI-Analyse ist fehlgeschlagen. Versuche es erneut.",
    "coach.quota": "Du hast alle Analysen dieses Monats verbraucht. Sie werden am ersten Tag des nächsten Monats zurückgesetzt.",
  },
};
