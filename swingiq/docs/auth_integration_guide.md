# SwingIQ Auth Module — Integration Guide

This guide walks you through wiring the auth module into the existing
`swingiq-app` and `swingiq-backend` projects.  Follow the steps in order.

---

## Part 1 — Supabase Project Setup (10 minutes)

### 1.1 Create a free project

1. Go to https://supabase.com and sign up
2. Click **New Project**
3. Name it `swingiq`, set a strong DB password, choose the region closest to your users
4. Wait ~2 minutes for provisioning

### 1.2 Run the database schema

1. In your Supabase dashboard, click **SQL Editor** → **New Query**
2. Open `supabase/migrations/001_initial_schema.sql` from this zip
3. Paste the entire contents and click **Run**
4. You should see "Success. No rows returned."

### 1.3 Get your API keys

Go to **Project Settings** → **API**. You need:

| Variable | Where to find it |
|----------|-----------------|
| `EXPO_PUBLIC_SUPABASE_URL` | "Project URL" (starts with `https://`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | "anon public" key |
| `SUPABASE_URL` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | "service_role" key (keep secret!) |

---

## Part 2 — Mobile App Integration

### 2.1 Install new dependencies

```bash
cd swingiq-app

npm install @supabase/supabase-js \
            react-native-url-polyfill \
            @react-native-async-storage/async-storage
```

Note: `@react-native-async-storage/async-storage` is already in package.json —
just make sure it installed correctly.

### 2.2 Copy new files

Copy these files from `app-additions/` into your `swingiq-app/src/` folder:

```
app-additions/services/supabase.ts          → src/services/supabase.ts
app-additions/services/auth.service.ts      → src/services/auth.service.ts
app-additions/services/api.authenticated.ts → src/services/api.ts   (replace existing)
app-additions/hooks/useAuth.ts              → src/hooks/useAuth.ts
app-additions/components/AuthProvider.tsx   → src/components/AuthProvider.tsx
app-additions/screens/SignInScreen.tsx      → src/screens/SignInScreen.tsx
app-additions/screens/SignUpScreen.tsx      → src/screens/SignUpScreen.tsx
app-additions/screens/ForgotPasswordScreen.tsx → src/screens/ForgotPasswordScreen.tsx
app-additions/screens/ProfileScreen.tsx     → src/screens/ProfileScreen.tsx
```

### 2.3 Update .env

Add to `swingiq-app/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key
```

### 2.4 Wrap the app with AuthProvider

Open `swingiq-app/app/_layout.tsx` and add AuthProvider:

```tsx
import { AuthProvider } from '@/components/AuthProvider';

export default function RootLayout() {
  // ... existing code ...
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>           {/* ← add this */}
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            {/* ... existing screens ... */}
          </Stack>
        </AuthProvider>           {/* ← and this */}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

### 2.5 Add auth routes

Create these files in `swingiq-app/app/auth/`:

```
app/auth/sign-in.tsx          → export { default } from '@/screens/SignInScreen';
app/auth/sign-up.tsx          → export { default } from '@/screens/SignUpScreen';
app/auth/forgot-password.tsx  → export { default } from '@/screens/ForgotPasswordScreen';
```

### 2.6 Add a Profile tab

Either add a 6th tab or replace the Space tab placeholder.

In `swingiq-app/app/(tabs)/`, create `profile.tsx`:
```tsx
export { default } from '@/screens/ProfileScreen';
```

Add the tab in `app/(tabs)/_layout.tsx`:
```tsx
<Tabs.Screen
  name="profile"
  options={{
    tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Profile" focused={focused} />,
  }}
/>
```

### 2.7 Update the index redirect

Open `swingiq-app/app/index.tsx` and update:

```tsx
import { Redirect } from 'expo-router';
import { useAuthContext } from '@/components/AuthProvider';
import { useStore } from '@/store';

export default function Index() {
  const { isSignedIn, authReady } = useAuthContext();
  const hasOnboarded = useStore(s => s.profile.hasCompletedOnboarding);

  if (!authReady) return null; // splash screen is still showing

  if (!isSignedIn) return <Redirect href="/auth/sign-in" />;
  if (!hasOnboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/home" />;
}
```

### 2.8 Sync sessions to Supabase after analysis

In `SwingScreen.tsx`, after `addSession(session)`:

```tsx
const { syncSession } = useAuthContext();

// existing:
addSession(session);
// add:
await syncSession(session);
```

---

## Part 3 — Backend Integration

### 3.1 Install new dependency

```bash
cd swingiq-backend
pip install httpx --break-system-packages  # already in requirements if you used the original
```

### 3.2 Copy new files

```
backend-additions/auth_middleware.py       → app/api/auth_middleware.py
backend-additions/analysis_with_auth.py   → app/api/analysis.py  (replace existing)
```

### 3.3 Update .env

Add to `swingiq-backend/.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your-service-role-key
```

⚠️  The service role key has full DB access — never expose it to the client.

### 3.4 Restart the backend

```bash
uvicorn app.main:app --reload
```

Test authenticated endpoint:
```bash
# First get a token by calling Supabase Auth directly (or from Postman)
TOKEN="eyJ..."

curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -F "video=@swing.mp4" \
  -F "player_name=Alex" \
  -F "skill_level=intermediate" \
  -F "club_used=7-iron"
```

---

## Part 4 — Testing the full flow

1. Start the backend: `uvicorn app.main:app --reload`
2. Start the app: `npx expo start`
3. Launch in simulator — you should land on the Sign In screen
4. Tap "Create account" → fill in name/email/password → Create Account
5. Onboarding flow appears → complete it
6. Home screen loads with your profile name in the hero
7. Record or upload a swing → Analyse → see results
8. Tap Profile tab → your stats and profile are shown
9. Sign out → redirected back to Sign In
10. Sign back in → your sessions are still there (loaded from Supabase)

---

## Common issues

| Problem | Fix |
|---------|-----|
| "Missing Supabase env vars" error on app start | Copy `.env.example` to `.env` and add your keys |
| 401 on every API call | Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in backend `.env` |
| Sessions not saving to DB | Check Supabase SQL editor → Table Editor → `swing_sessions` for errors |
| "Network request failed" on device | Use your computer's LAN IP in `EXPO_PUBLIC_API_URL`, not `localhost` |
| Profile not loading after signup | The `handle_new_user` trigger creates the profile — check it ran in SQL Editor |
