# SwingIQ — React Native Mobile App

iOS + Android app built with Expo. Connects to the SwingIQ FastAPI backend.

---

## Prerequisites (install once)

### 1. Node.js
Download from https://nodejs.org — install the LTS version (20+).

Verify: `node --version` should print `v20.x.x` or higher.

### 2. Expo CLI
```bash
npm install -g expo-cli eas-cli
```

### 3. For iOS (Mac only)
Install Xcode from the Mac App Store, then:
```bash
xcode-select --install
```

### 4. For Android
Install Android Studio from https://developer.android.com/studio
During setup, install the Android SDK and create a virtual device (Pixel 8, API 34).

---

## Quick start

```bash
# 1. Install dependencies
cd swingiq-app
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — set EXPO_PUBLIC_API_URL to your backend address

# 3. Start the development server
npx expo start
```

The terminal will show a QR code and menu options:
- Press `i` — open in iOS Simulator
- Press `a` — open in Android Emulator
- Scan QR with Expo Go app (physical device)

---

## Project structure

```
swingiq-app/
├── app/                          # Expo Router file-based routing
│   ├── _layout.tsx               # Root layout (providers, splash screen)
│   ├── index.tsx                 # Entry point (redirect logic)
│   ├── onboarding.tsx            # Onboarding flow route
│   ├── (tabs)/                   # Main 5-tab navigation
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── home.tsx              # Dashboard
│   │   ├── swing.tsx             # Swing analysis (camera + upload)
│   │   ├── track.tsx             # Ball tracking (Phase 3)
│   │   ├── analytics.tsx         # Performance stats
│   │   └── challenge.tsx         # Monthly competition
│   └── swing/
│       └── results.tsx           # Analysis results (modal)
│
└── src/                          # All non-route code
    ├── screens/                  # Screen components
    │   ├── OnboardingScreen.tsx  # 3-step first-launch flow
    │   ├── HomeScreen.tsx        # Dashboard with tiles + challenge banner
    │   ├── SwingScreen.tsx       # Camera record + video upload + club picker
    │   ├── ResultsScreen.tsx     # Score ring + feedback cards + next focus
    │   └── AnalyticsScreen.tsx   # Stats, bar chart, skill bars, history
    ├── components/
    │   └── ui.tsx                # ScoreRing, FeedbackCard, MetricPill, etc.
    ├── services/
    │   └── api.ts                # All calls to the FastAPI backend
    ├── store/
    │   └── index.ts              # Zustand global state + AsyncStorage persistence
    └── theme/
        └── index.ts              # Colors, Typography, Spacing, Radius, Shadow
```

---

## Screen flow

```
Launch
  │
  ├── First time? → Onboarding (3 steps: name, skill, handicap)
  │                     └── completeOnboarding() → Main tabs
  │
  └── Returning?  → Main tabs (state restored from AsyncStorage)

Main Tabs
  ├── Home        → Quick tiles, challenge banner, recent sessions
  ├── Swing       → Select mode
  │     ├── Record  → Camera → Stop → Preview → Club picker → Submit
  │     └── Upload  → Library picker  → Preview → Club picker → Submit
  │                           └── analyzeSwing() → Results screen
  ├── Track       → (Phase 3 placeholder)
  ├── Analytics   → Stats grid, weekly chart, skill bars, history list
  └── Challenge   → Leaderboard, payout breakdown, upload CTA
```

---

## Connecting to the backend

The app sends a `multipart/form-data` POST to `/api/v1/analyze`.

Make sure the SwingIQ FastAPI backend is running:
```bash
cd swingiq-backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then in the app's `.env`:
- **iOS Simulator**:       `EXPO_PUBLIC_API_URL=http://localhost:8000`
- **Android Emulator**:   `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`
- **Physical device**:    `EXPO_PUBLIC_API_URL=http://192.168.1.XX:8000`
  (Replace `192.168.1.XX` with your computer's local IP — `ifconfig` on Mac, `ipconfig` on Windows)

---

## Building for distribution

### Preview build (internal testing via QR)
```bash
eas build --profile preview --platform all
```

### Production build (App Store + Google Play)
```bash
eas build --profile production --platform all
```

You'll need an Apple Developer account ($99/yr) and Google Play Console account ($25 one-time).

---

## Next modules to add

| Feature | File to create | Notes |
|---------|---------------|-------|
| Ball tracking | `src/screens/TrackScreen.tsx` | Replace placeholder — use OpenCV via backend |
| Space mapping | `src/screens/SpaceScreen.tsx` | ARKit/ARCore via expo-camera AR mode |
| Challenge payments | Update `challenge.tsx` | Stripe React Native SDK |
| Push notifications | `src/services/notifications.ts` | expo-notifications |
| Auth | `app/auth/` | Supabase Auth — fastest option |
| Video playback | Update `SwingScreen.tsx` | expo-av `Video` component |
