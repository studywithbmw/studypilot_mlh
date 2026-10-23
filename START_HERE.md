# StudyPilot - start here

1. **Back up** your current project folder (your old `backend/` used Postgres; this version does not need it).
2. Copy this folder's contents over your project. Keep your own `.env` / `.env.local` files.
3. Frontend `.env` and `.env.local`: set `VITE_USE_MOCK=false` (exactly `false`) and keep `VITE_API_URL=http://localhost:7860/api/v1`.
4. Backend: follow `backend/README.md`. In `backend/.env`:
   - `SUPABASE_URL` must equal the frontend's `VITE_SUPABASE_URL` (same Supabase project)
   - add `GROQ_API_KEY` and/or `GEMINI_API_KEY`
5. Run the backend (port 7860), then `npm run dev` for the frontend.
6. In the browser console run `localStorage.clear()` once (or use a private window) to drop old demo data, then sign in again.
