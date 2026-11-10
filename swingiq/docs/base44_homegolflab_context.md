# HomeGolf LAB — Documento maestro de contexto (handoff para IA)

> Pega este documento completo como primer mensaje a tu Claude. Está escrito para que otra IA entienda
> el producto, la arquitectura, las reglas de negocio y las convenciones del código sin ver los archivos.
>
> **Cómo continuar:** "Eres un ingeniero senior de React. Este es el contexto de mi app HomeGolf LAB.
> Trabajas sobre el código real (repo privado / editor Base44). Antes de proponer cambios, respeta la
> sección 'Convenciones obligatorias'. No cambies lógica de negocio salvo que te lo pida explícitamente."

---

## 1. Visión del producto

**HomeGolf LAB** es una app de práctica de golf de **juego corto (short game)** pensada para gente con
**presupuesto limitado**: entrena en casa, sin campo, sin coach, usando solo el móvil.

**Propuesta de valor:** convierte tu móvil en un laboratorio de práctica — analiza tu swing, escanea tu
patio/jardín para diseñar una rutina, registra tus tiros con la cámara, y compite con amigos y en retos
mensuales con premios en dinero.

**Pilares del producto:**

1. **Análisis de swing** con IA a partir de vídeo corto.
2. **Home Practice** — escaneo del espacio de práctica (foto) para generar un plan.
3. **Shot Tracker / Ball Tracking** — sesión de cámara que detecta palo, mide tiros y calcula dispersión.
4. **Challenges** — retos mensuales de pago con pozo en premios + retos privados entre amigos.
5. **Gamificación social** — XP, niveles, badges, amigos, invitaciones con QR/referidos.
6. **Suscripción** — gratis con límites + anuncios; premium sin límites.

**Idioma principal del producto y de la UI:** español (con 8 idiomas disponibles, ver §9).

**Estado:** app web (Vite + React) en el editor Base44, **sin publicar todavía**. Preparada también para
build nativo iOS/Android vía Capacitor (hay un `CAPACITOR_SETUP.md`).

---

## 2. Stack técnico real

- **React 18** + **Vite** (ESM, sin `require`, sin `module.exports`).
- **Tailwind CSS** + **shadcn/ui** (todos los componentes ya instalados en `src/components/ui/`).
- **framer-motion** — animaciones de entrada y tarjetas.
- **recharts** — gráficas (analytics de tracking).
- **@tanstack/react-query** — fetching/caché de entidades.
- **react-router-dom** v6 — rutas.
- **date-fns** (con locales es/en/fr/pt/de/it/ja/zh) y **moment**.
- **lucide-react** — única librería de iconos.
- **qrcode.react** — QR de invitación.
- **canvas-confetti** — celebraciones de badge.
- **@stripe/react-stripe-js** — instalado para el flujo de pago web.
- **Base44 SDK** (`@/api/base44Client`) — auth, entidades, integraciones.

**Restricción importante:** solo se pueden usar los paquetes ya instalados. Nada de librerías nuevas sin
pedirlo. No hay backend propio: la lógica de servidor son entidades + integraciones del SDK de Base44.
No existen backend functions ni workflows creados en este proyecto.

**Integraciones disponibles:** `Core.InvokeLLM` (con `file_urls` y `response_json_schema`),
`Core.UploadFile` (archivos públicos), `Core.SendEmail`, `GenerateImage`.

**Alias de import:** siempre `@/...` (nunca rutas relativas tipo `../../`).

---

## 3. Diseño y branding (tokens ya definidos)

Definidos en `src/index.css` (valores HSL) y mapeados en `tailwind.config.js`. **Nunca** usar colores
hardcodeados (`bg-white`, `bg-[#fff]`, `style={{color:...}}`); siempre clases de token.

| Token | Light | Uso |
|---|---|---|
| `--background` | `140 20% 97%` | fondo general (verde muy claro) |
| `--foreground` | `150 30% 8%` | texto principal |
| `--primary` | `152 45% 28%` | verde golf oscuro (marca) |
| `--secondary` / `--accent` | `43 65% 52%` | dorado (premios, CTA secundario) |
| `--card` | `0 0% 100%` | superficies |
| `--muted` | `140 15% 93%` | fondos suaves |
| `--border` | `140 15% 88%` | bordes |
| `--radius` | `0.75rem` | esquinas redondeadas |

- Fuentes: **`--font-heading` = Playfair Display** (serif, títulos) y **`--font-body` = Inter**.
  Clases: `font-heading`, `font-body`.
- Existe modo oscuro (`.dark` en `index.css`) ya tokenizado.
- Estilo visual: limpio, moderno, tarjetas redondeadas (`rounded-2xl`), gradientes suaves de verde y
  dorado, animaciones discretas con framer-motion, mobile-first pero con sidebar en desktop.

---

## 4. Rutas y navegación

Registradas en `src/App.jsx` (todas las privadas dentro de `ProtectedRoute` + `AppLayout`):

| Ruta | Página | Descripción |
|---|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/mfa` | auth (boilerplate Base44, traducido) | flujo completo email/password + Google + OTP + MFA |
| `/` | `Dashboard` | home: hero, 4 tarjetas de herramientas, sesiones recientes |
| `/swing-analysis` | `SwingAnalysis` | subir vídeo → análisis IA |
| `/home-practice` | `HomePractice` | subir foto del espacio → plan de práctica IA |
| `/ball-tracking` | `BallTracking` | sesión de cámara + detección de palo + tracking |
| `/challenges` | `Challenges` | retos mensuales, mis inscripciones |
| `/challenges/:id` | `ChallengeDetail` | detalle, leaderboard, envío diario, misiones |
| `/profile` | `Profile` | perfil, avatar, stats, badges, nivel, suscripción, idioma |
| `/friends` | `Friends` | amigos, solicitudes, retos privados, invitaciones |
| `/subscription` | `Subscription` | planes y activación |
| `*` | `PageNotFound` | 404 |

**Navegación decidida (no cambiar sin pedirlo):**
- **Bottom bar móvil limita a 5 ítems**: Swing · Home Practice · Home · Tracking · Challenges.
- El **perfil NO está en la barra**; se accede por el menú de tres barras y por el avatar desplegable.
- Desktop: sidebar lateral con los mismos ítems + estado de suscripción + selector de idioma.

---

## 5. Modelo de datos (entidades Base44)

Cada entidad vive en `base44/entities/<Nombre>.jsonc`. Todas tienen además los campos del sistema:
`id`, `created_date`, `updated_date`, `created_by_id`.

### `User` (built-in, ampliada)
`role` (`admin`|`user`, requerido) · `avatar_url` (foto de perfil) · `nickname` · `handicap` (texto, ej. "18.4")
· `home_course`.

### `PracticeSession`
`type` (`swing_analysis`|`home_practice`|`ball_tracking`, req.) · `date` (req.) · `video_url` · `photo_url`
· `ai_analysis` (JSON en string con el resultado de la IA) · `notes` · `score` (0–10).
> Convención de `notes` en tracking: contiene `"Sesión X min"` para detectar sesiones largas (badges).

### `Subscription`
`user_email` (req.) · `plan` (`free`|`monthly`|`quarterly`|`semiannual`|`annual`) · `status`
(`trial`|`active`|`expired`|`cancelled`) · `trial_start_date` · `trial_end_date` · `subscription_start_date`
· `subscription_end_date` · `platform` (`ios`|`android`|`web`) · `store_transaction_id` · `store_product_id`
· `price_paid`.

### `Challenge` (retos públicos mensuales)
`title` · `description` · `month` (ej. "June 2026") · `registration_deadline` · `start_date` · `end_date`
· `entry_fee` (USD) · `prize_1st_pct` · `prize_2nd_pct` · `prize_3rd_pct` · `status`
(`registration_open`|`active`|`completed`) · `total_pool`.

### `ChallengeEntry`
`challenge_id` · `user_email` · `user_name` · `total_points` (default 0) · `paid` (bool).

### `DailySubmission` (envíos diarios dentro de un reto)
`challenge_id` · `entry_id` · `user_email` · `date` · `video_url` · `shots_made` (de 10) · `points_earned`
· `ai_verification` (análisis IA del vídeo).

### `PrivateChallenge` (reto entre amigos)
`title` · `description` · `creator_email` · `creator_name` · `participant_emails[]` · `entry_fee` · `total_pool`
· `start_date` · `end_date` · `status` (`open`|`active`|`completed`) · `winner_pct` (80) · `app_pct` (20).

### `Friendship`
`requester_email` · `requester_name` · `receiver_email` · `receiver_name` · `status`
(`pending`|`accepted`|`declined`).

### `Badge` (badges ganados)
`user_email` · `badge_id` · `earned_at` · `context` (JSON con la sesión que lo disparó).
> Las definiciones de badge NO están en la base de datos, están en `src/lib/badges.js` (catálogo estático).

---

## 6. Reglas de negocio implementadas

### 6.1 Suscripción (`src/lib/useSubscription.js`)
- Al primer acceso se crea automáticamente una suscripción `free` + `status: trial` con **3 días** de prueba.
- `isPremium` = trial vigente **o** `status: active` con `subscription_end_date` futuro.
- Planes (precio y `productId` de tienda incluidos):
  - `monthly` — 4,99 $ — `homegolflab_monthly`
  - `quarterly` — 14,22 $ (−5 %) — `homegolflab_quarterly`
  - `semiannual` — 26,95 $ (−10 %) — `homegolflab_semiannual`
  - `annual` — 47,90 $ (−20 %) — `homegolflab_annual`
- `activatePlan({plan, transactionId, productId, platform})` actualiza la suscripción y extiende el fin según meses.
- **Límites free vs premium** (exportados como `FREE_LIMITS` / `PREMIUM_LIMITS`):
  - Vídeos de swing: 1/día (free) → ilimitado.
  - Anuncio cada 5 vídeos de swing (free).
  - Escaneo de Home Practice: 1 cada 14 días (free) → sin límite.
  - Anuncio cada 30 min de ball tracking (free).
  - Intentos de challenge: 1/día (free) → 2/día.
  - Anuncios en retos de amigos (solo free).
- Componentes: `TrialBanner`, `AdModal` (recompensa simulada tipo rewarded ad).

### 6.2 Gamificación (`src/lib/badges.js` + `src/hooks/useBadges.js`)
- **20 badges** agrupados en categorías: inicio, dedicación, tracking, calidad, resistencia, consistencia,
  mejora, challenges. Cada uno con `emoji`, color de gradiente y **XP** (50–800).
- **Niveles**: 1 Principiante (0 XP) · 2 Amateur (200) · 3 Aficionado (600) · 4 Semipro (1200)
  · 5 Profesional (2500) · 6 Tour Player (5000).
- `evaluateNewBadges({sessions, earnedBadgeIds, entries})` evalúa condiciones sobre las sesiones
  (número de sesiones, tiros acumulados, 10/10, sesiones ≥60/120 min, dispersión, mejora ≥5 % semanal,
  primer challenge) y devuelve solo los IDs nuevos.
- UI: `BadgesSection` (colección con filtros), `BadgeCard`, `LevelBanner` (progreso al siguiente nivel),
  `BadgeUnlockToast` (cola animada de desbloqueo, se muestra en serie).

### 6.3 Challenges
- Retos mensuales de pago: `entry_fee` alimenta `total_pool`; reparto por porcentajes 1.º/2.º/3.º.
- `ChallengeEntry` acumula `total_points`; `DailySubmission` registra el envío del día (máx. 10 tiros,
  puntos y verificación por IA del vídeo).
- `ChallengeLeaderboard` ordena participantes; `MissionsPanel` muestra misiones/objetivos del reto;
  `DailySubmissionForm` gestiona el envío diario.
- Retos privados entre amigos: se crean desde Friends eligiendo amigos de la lista, con reparto
  **80 % ganador / 20 % app**.

### 6.4 Social y referidos
- `Friends`: pestañas de amigos, solicitudes pendientes, invitaciones y retos privados.
- `InviteCard`: genera link de referido (`?ref=<email>` o similar), lo copia/comparte (Web Share API y
  WhatsApp) y muestra un **QR** con los datos del invitador (usa `qrcode.react`).
- Al registrarse con un email de invitación, se **crea la amistad automáticamente** (lógica en `Register.jsx`).
- `FriendAvatar`: resuelve el `avatar_url` del amigo por email y lo muestra (o iniciales como fallback).
- `AvatarUpload`: sube/reemplaza la foto de perfil del usuario y la guarda en `User.avatar_url`.

### 6.5 IA (flujos)
Todos usan `base44.integrations.Core.InvokeLLM` con `file_urls` (vídeo/foto ya subidos) y
`response_json_schema` para recibir JSON estructurado.
- **SwingAnalysis**: vídeo corto → análisis técnico (puntos de mejora, score).
- **HomePractice**: foto del espacio → plan/rutina de práctica.
- **BallTracking**: sesión de cámara temporizada, detección de palo (`ClubDetector`), análisis por tiro con
  resultado (`ShotResultCard`: trayectoria, distancia, velocidad, altura, calidad, desviación lateral),
  mapa de dispersión (`DispersionMap`), resumen (`SessionSummary`), y módulo premium `AdvancedAnalytics`
  (tendencias mensuales y comparación de sesiones, solo suscriptores).
- Los resultados se guardan como JSON en `PracticeSession.ai_analysis`.
- Los archivos subidos usan `UploadFile` (públicos: cualquiera con el enlace puede abrirlos).

### 6.6 Idiomas (`src/lib/i18n.jsx`)
8 idiomas: `es`, `en`, `fr`, `pt`, `de`, `it`, `ja`, `zh`. Contexto `LangProvider` + hook `useLang()` con
`t('clave')`, persistencia en localStorage y fallback a inglés para claves faltantes. `LanguageSwitcher`
en sidebar. **Toda cadena nueva de UI debe añadirse a las traducciones**, no hardcodeada.

---

## 7. Arquitectura de archivos (mapa)

```
src/
├── App.jsx                        # router + AuthProvider + QueryClient + Toaster + LangProvider
├── pages/
│   ├── Dashboard.jsx              # home (hero, herramientas, sesiones recientes)
│   ├── SwingAnalysis.jsx          # vídeo → IA
│   ├── HomePractice.jsx           # foto → plan IA
│   ├── BallTracking.jsx           # tracker con cámara (el archivo más grande, ~500 líneas)
│   ├── Challenges.jsx / ChallengeDetail.jsx
│   ├── Profile.jsx                # perfil, avatar, stats, badges, plan, idioma
│   ├── Friends.jsx                # amigos, solicitudes, retos privados, invitación
│   ├── Subscription.jsx           # planes
│   └── Login / Register / ForgotPassword / ResetPassword / Mfa / OAuthConsent  (boilerplate auth)
├── components/
│   ├── layout/AppLayout.jsx       # shell: sidebar desktop, header móvil, bottom nav 5 ítems
│   ├── shared/                    # VideoUploader, PhotoUploader, AvatarUpload, AnalysisResult
│   ├── tracking/                  # ClubDetector, ShotResultCard, DispersionMap, SessionSummary, AdvancedAnalytics
│   ├── challenges/                # ChallengeLeaderboard, DailySubmissionForm, MissionsPanel
│   ├── gamification/              # BadgesSection, BadgeCard, LevelBanner, BadgeUnlockToast
│   ├── friends/                   # InviteCard, FriendAvatar
│   ├── subscription/              # TrialBanner, AdModal
│   └── ui/                        # shadcn (todos)
├── lib/
│   ├── i18n.jsx                   # traducciones + contexto
│   ├── badges.js                  # catálogo de badges, niveles y evaluación
│   ├── useSubscription.js         # planes, trial, límites free/premium
│   ├── AuthContext.jsx, authMfa*.js, PageNotFound.jsx, query-client.js, utils.js
└── hooks/useBadges.js             # carga badges del usuario + evalúa nuevos
```

**Patrón de pantalla:** `useQuery` para datos (`base44.entities.X.filter({...})`), estados de carga
(spinner `Loader2`), empty state, y `queryClient.invalidateQueries` tras mutaciones. Animaciones con
`motion.div` (fade + slide-up, delays escalonados).

---

## 8. Convenciones obligatorias del código

1. **ESM puro** — nunca `require()` ni `module.exports`.
2. **Imports con alias `@/`** — nunca relativos con `../`.
3. **shadcn** — cada primitivo se importa de su propio archivo (`@/components/ui/button`,
   `@/components/ui/label`, `@/components/ui/use-toast`…). Un archivo de `ui/` no re-exporta otro.
4. **`cn`** viene de `@/lib/utils`. **`createPageUrl`** de `@/utils`.
5. **Iconos solo de lucide-react** y solo nombres existentes; si un icono choca con un componente local,
   se aliasa (`Home as HomeIcon`).
6. **Clases Tailwind literales** — nunca construidas dinámicamente (`bg-${color}-500` no funciona).
7. **Sin colores/fuentes hardcodeadas** — usar tokens (`bg-primary`, `font-heading`, `text-muted-foreground`).
8. **Entidades**: `filter/list` con objeto de opciones devuelven una página → leer `.items`.
   Filtros, conteos y agregados se resuelven en el servidor, no en JS sobre todo el listado.
9. **Páginas y componentes**: `export default` con el mismo nombre del archivo; componentes pequeños y
   enfocados (≤ ~50 líneas); si una página crece, se parte en componentes.
10. **Enrutado**: toda página nueva necesita su `<Route>` en `src/App.jsx`; solo `<Route>` dentro de
    `<Routes>`; layouts con `<Outlet />`; `*` → `PageNotFound` al final.
11. **Errores**: los errores se dejan subir (no `try/catch` genéricos), salvo en formularios de usuario
    donde se muestra error inline y se desactiva el botón mientras carga.
12. **Auth**: no se reimplementa. Páginas boilerplate intactas en su lógica (login → MFA → redirect duro).
13. **No cambiar funcionalidad existente** cuando el pedido es de UI/estilo.

---

## 9. Decisiones ya tomadas (no reabrir sin pedirlo)

- Bottom nav **solo** con 5 ítems; perfil fuera de la barra.
- Analytics avanzado de tracking es **premium** (gate por suscripción).
- Crecimiento viral vía **link de invitación + QR**, y amistad automática al registrarse por invite.
- Perfiles con **foto propia** (`avatar_url`) visible para amigos.
- 8 idiomas desde el inicio; español por defecto.
- Trial de **3 días** generado automáticamente.
- Retos privados con reparto **80/20**.
- Nada de librerías nuevas sin autorización.

---

## 10. Estado actual y pendientes conocidos

**Hecho:** auth completo (email + Google + OTP + MFA), layout responsive con navegación, dashboard,
análisis de swing, home practice, ball tracking con cámara y módulo premium de analytics, challenges
públicos con detalle/leaderboard/envíos diarios/misiones, retos privados, sistema de amigos con
invitación + QR + foto de perfil, gamificación completa (badges/XP/niveles), suscripción con trial y
límites free/premium, i18n en 8 idiomas.

**Pendiente / a decidir:**
- **Publicar la app** (aún no tiene URL pública).
- Pagos reales: hoy la activación de plan es local en la entidad `Subscription`; falta conectar
  Stripe (web) y compras in-app (iOS/Android) con verificación de recibos.
- Datos semilla de `Challenge` / `PrivateChallenge` para probar el flujo completo.
- Reglas de acceso (RLS) por usuario en las entidades personales.
- Ajustes de contenido: criterios de puntuación de la IA, textos legales de los retos con dinero.

---

## 11. Cómo quiero que trabajes conmigo

- Responde y escribe la UI **en español**.
- Cambios **mínimos y quirúrgicos**: no refactorices ni rediseñes lo que no te pedí.
- Antes de tocar algo, dime en 1 frase qué vas a hacer; al terminar, 1–2 frases de resultado.
- Si un pedido es ambiguo, hazme **1–3 preguntas concretas** en lugar de adivinar.
- Nunca inventes datos, precios ni funcionalidades que no existan en este documento.
- Cuando crees algo nuevo, respeta tokens de diseño, i18n y las convenciones de §8.