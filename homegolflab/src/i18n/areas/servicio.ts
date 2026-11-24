/**
 * Área «servicio»: mensajes de la app cuando el servidor no puede atender (tope diario de gasto agotado, bloque 4 del plan v2).
 * R8: no menciona la IA ni los tokens. Idiomas: es (fuente) y los otros 9 completos. Borrador de IA, sin revisión nativa.
 */
import type { Area } from './index';

export const servicio: Area = {
  es: { "server.unavailableToday": "Este servicio no está disponible por hoy. Inténtalo mañana." },
  en: { "server.unavailableToday": "This service is not available for today. Please try again tomorrow." },
  pt: { "server.unavailableToday": "Este serviço não está disponível por hoje. Tenta novamente amanhã." },
  de: { "server.unavailableToday": "Dieser Dienst ist für heute nicht verfügbar. Bitte versuche es morgen erneut." },
  fr: { "server.unavailableToday": "Ce service n’est pas disponible pour aujourd’hui. Réessaie demain." },
  it: { "server.unavailableToday": "Questo servizio non è disponibile per oggi. Riprova domani." },
  ja: { "server.unavailableToday": "このサービスは本日は利用できません。明日もう一度お試しください。" },
  ko: { "server.unavailableToday": "이 서비스는 오늘은 이용할 수 없습니다. 내일 다시 시도해 주세요." },
  sv: { "server.unavailableToday": "Den här tjänsten är inte tillgänglig idag. Försök igen i morgon." },
  nl: { "server.unavailableToday": "Deze dienst is vandaag niet beschikbaar. Probeer het morgen opnieuw." },
};
