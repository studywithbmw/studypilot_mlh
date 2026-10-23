# StudyPilot Stage 2 – changed files

Copy these over your project (same paths). Then run `npm install`.

## Delete these
- bun.lock
- src/components/study/CyeraMissionGame.tsx

## New files
- backend/app/api/deps.py
- backend/app/api/routes/me.py
- backend/app/api/routes/workspaces.py
- backend/app/db_url.py
- backend/app/repositories/__init__.py
- backend/app/repositories/base.py
- backend/app/repositories/profiles.py
- backend/app/repositories/workspaces.py
- backend/app/schemas.py
- backend/app/supabase_admin.py
- backend/tests/jwt_helpers.py
- backend/tests/test_auth_dependency.py
- backend/tests/test_db_url.py
- backend/tests/test_jwt_hardening.py
- backend/tests/test_me_api.py
- backend/tests/test_request_id.py
- backend/tests/test_supabase_admin.py
- backend/tests/test_workspaces_api.py
- src/components/auth/OnboardingRoute.tsx
- src/components/auth/ProtectedRoute.tsx
- src/components/auth/PublicOnlyRoute.tsx
- src/components/study/SentinelMissionGame.tsx
- src/lib/api/apiClient.test.ts
- src/lib/api/http.test.ts
- src/lib/api/http.ts
- src/lib/authErrors.test.ts
- src/lib/authErrors.ts
- src/lib/env.test.ts
- src/lib/env.ts
- src/lib/queryClient.ts
- src/lib/safeNext.test.ts
- src/lib/safeNext.ts
- src/lib/supabase.ts
- src/pages/ResetPasswordPage.tsx
- src/store/useAuthStore.test.ts
- src/vite-env.d.ts

## Modified files
- README.md
- backend/app/auth/jwt.py
- backend/app/config.py
- backend/app/db.py
- backend/app/main.py
- backend/app/middleware.py
- backend/pyproject.toml
- backend/scripts/migrate.py
- backend/tests/conftest.py
- docs/PLAN.md
- index.html
- package-lock.json
- package.json
- src/App.tsx
- src/components/layout/Topbar.tsx
- src/index.css
- src/lib/api/README.md
- src/lib/api/apiClient.ts
- src/lib/constants.ts
- src/main.tsx
- src/pages/AuthPage.tsx
- src/pages/LandingPage.tsx
- src/pages/OnboardingPage.tsx
- src/pages/SettingsPage.tsx
- src/store/useAuthStore.ts
- src/store/useSettingsStore.ts
- src/store/useWorkspaceStore.ts
- src/types/index.ts
