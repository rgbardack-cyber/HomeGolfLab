# MANIFEST — HomeGolf LAB (Base44) export

- Fuente: editor de Base44, app HomeGolf LAB (solo lectura, vía los endpoints de lectura `code/file-list` y `code/content` que usa el propio editor).
- Fecha de extracción: 2026-11-09
- Archivos: 137 de 137 listados por Base44 (0 faltantes, 0 errores). 506.471 caracteres.
- Secretos: escaneo por patrones (claves Stripe/Anthropic/Google, JWT, api_key/secret/token) sin hallazgos reales; no hay `.env` en el proyecto.
- Nada fue modificado en Base44.

## Verificación contra el árbol del documento maestro (§7)

Todo lo listado existe. Diferencias:
- `src/components/tracking/ClubDetector.jsx` es un placeholder (devuelve null); la detección de palo está inline en `src/pages/BallTracking.jsx`.
- `CAPACITOR_SETUP.md` y `capacitor.config.json` están en `src/`, no en la raíz.
- `PROJECT_CONTEXT.md` es idéntico a `docs/base44_homegolflab_context.md`.
- Extra no mencionados: `src/CODIGO_COMPLETO.md`, `src/pages/OAuthConsent.jsx`, componentes MFA, `base44/mcp/config.json`.

## Archivos

```
.gitignore
PROJECT_CONTEXT.md
README.md
base44/config.jsonc
base44/entities/Badge.jsonc
base44/entities/Challenge.jsonc
base44/entities/ChallengeEntry.jsonc
base44/entities/DailySubmission.jsonc
base44/entities/Friendship.jsonc
base44/entities/PracticeSession.jsonc
base44/entities/PrivateChallenge.jsonc
base44/entities/Subscription.jsonc
base44/entities/User.jsonc
base44/mcp/config.json
components.json
eslint.config.js
index.html
jsconfig.json
package.json
postcss.config.js
src/App.jsx
src/CAPACITOR_SETUP.md
src/CODIGO_COMPLETO.md
src/api/base44Client.js
src/capacitor.config.json
src/components/AuthLayout.jsx
src/components/GoogleIcon.jsx
src/components/LanguageSwitcher.jsx
src/components/MfaFlow.jsx
src/components/MfaManage.jsx
src/components/MfaMethodSetup.jsx
src/components/MfaParts.jsx
src/components/ProtectedRoute.jsx
src/components/UserNotRegisteredError.jsx
src/components/challenges/ChallengeLeaderboard.jsx
src/components/challenges/DailySubmissionForm.jsx
src/components/challenges/MissionsPanel.jsx
src/components/friends/FriendAvatar.jsx
src/components/friends/InviteCard.jsx
src/components/gamification/BadgeCard.jsx
src/components/gamification/BadgeUnlockToast.jsx
src/components/gamification/BadgesSection.jsx
src/components/gamification/LevelBanner.jsx
src/components/layout/AppLayout.jsx
src/components/shared/AnalysisResult.jsx
src/components/shared/AvatarUpload.jsx
src/components/shared/PhotoUploader.jsx
src/components/shared/VideoUploader.jsx
src/components/subscription/AdModal.jsx
src/components/subscription/TrialBanner.jsx
src/components/tracking/AdvancedAnalytics.jsx
src/components/tracking/ClubDetector.jsx
src/components/tracking/DispersionMap.jsx
src/components/tracking/SessionSummary.jsx
src/components/tracking/ShotResultCard.jsx
src/components/ui/accordion.jsx
src/components/ui/alert-dialog.jsx
src/components/ui/alert.jsx
src/components/ui/aspect-ratio.jsx
src/components/ui/avatar.jsx
src/components/ui/badge.jsx
src/components/ui/breadcrumb.jsx
src/components/ui/button.jsx
src/components/ui/calendar.jsx
src/components/ui/card.jsx
src/components/ui/carousel.jsx
src/components/ui/chart.jsx
src/components/ui/checkbox.jsx
src/components/ui/collapsible.jsx
src/components/ui/command.jsx
src/components/ui/context-menu.jsx
src/components/ui/dialog.jsx
src/components/ui/drawer.jsx
src/components/ui/dropdown-menu.jsx
src/components/ui/form.jsx
src/components/ui/hover-card.jsx
src/components/ui/input-otp.jsx
src/components/ui/input.jsx
src/components/ui/label.jsx
src/components/ui/menubar.jsx
src/components/ui/navigation-menu.jsx
src/components/ui/pagination.jsx
src/components/ui/popover.jsx
src/components/ui/progress.jsx
src/components/ui/radio-group.jsx
src/components/ui/resizable.jsx
src/components/ui/scroll-area.jsx
src/components/ui/select.jsx
src/components/ui/separator.jsx
src/components/ui/sheet.jsx
src/components/ui/sidebar.jsx
src/components/ui/skeleton.jsx
src/components/ui/slider.jsx
src/components/ui/sonner.jsx
src/components/ui/switch.jsx
src/components/ui/table.jsx
src/components/ui/tabs.jsx
src/components/ui/textarea.jsx
src/components/ui/toast.jsx
src/components/ui/toaster.jsx
src/components/ui/toggle-group.jsx
src/components/ui/toggle.jsx
src/components/ui/tooltip.jsx
src/components/ui/use-toast.jsx
src/hooks/use-mobile.jsx
src/hooks/useBadges.js
src/index.css
src/lib/AuthContext.jsx
src/lib/PageNotFound.jsx
src/lib/app-params.js
src/lib/authMfa.js
src/lib/authMfaFlow.js
src/lib/authReturnTo.js
src/lib/badges.js
src/lib/i18n.jsx
src/lib/query-client.js
src/lib/useSubscription.js
src/lib/utils.js
src/main.jsx
src/pages/BallTracking.jsx
src/pages/ChallengeDetail.jsx
src/pages/Challenges.jsx
src/pages/Dashboard.jsx
src/pages/ForgotPassword.jsx
src/pages/Friends.jsx
src/pages/HomePractice.jsx
src/pages/Login.jsx
src/pages/Mfa.jsx
src/pages/OAuthConsent.jsx
src/pages/Profile.jsx
src/pages/Register.jsx
src/pages/ResetPassword.jsx
src/pages/Subscription.jsx
src/pages/SwingAnalysis.jsx
src/utils/index.ts
tailwind.config.js
vite.config.js
```
