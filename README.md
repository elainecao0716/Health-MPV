# ❤️ Health MPV

A personal health-tracking dashboard: weight and BMI, a goal-weight tracker, daily check-ins
(sleep/water/exercise/mood), a lab-results tracker with reference ranges and trends, PDF lab-report
import (including OCR for scanned reports), and a set of AI features (health coach advice, chat,
and lab insights) that only ever describe facts the app has already calculated — never a
diagnosis.

**This is a personal tracking tool, not a medical device.** Nothing in this app is medical advice,
a diagnosis, or a substitute for a licensed clinician. Always use the reference range printed on
your actual lab report, not any suggested range shown here, and discuss any concerning result with
a healthcare professional.

## Main features

- Weight logging with BMI, weight-change, and trend chart
- Goal-weight tracking with progress percentage
- Daily check-ins (sleep, water, exercise, mood, notes) with full CRUD
- Lab results with reference ranges, in/out-of-range status, filtering, search, and per-test trend
  charts (only compares results recorded in the same unit)
- PDF lab-report import — text-based reports (e.g. Quest-style) parse deterministically; scanned
  reports fall back to AI vision OCR — both produce an editable draft you review and approve
  before anything is saved
- AI Health Coach (generated advice), AI Chat, and AI Lab Insights — all grounded in
  pre-calculated facts from your own data, never invented
- A factual Visit Summary you can copy or print to bring to an appointment
- A compact sticky section-navigation bar for jumping around the dashboard

## Technology stack

- **Frontend**: React 19 + Vite, plain CSS (no framework) with a token-based design system,
  Recharts for charts, `@supabase/supabase-js` for auth/data
- **Backend**: Node.js + Express, `openai` (gpt-4o-mini) for AI features, `pdfjs-dist` +
  `@napi-rs/canvas` for PDF parsing/rendering, `multer` (memory storage only) for uploads,
  `express-rate-limit` for abuse control
- **Database/auth**: Supabase (Postgres + Row Level Security + email/password auth)
- **Testing**: Vitest
- **Linting**: oxlint

## Local setup

Prerequisites: Node.js 18+, a Supabase project (see below), an OpenAI API key (optional — only
needed for the AI features and OCR).

```bash
# Frontend
npm install

# Backend
cd server
npm install
```

Create two env files (never commit either — both are already gitignored):

**`.env`** (project root, read by Vite at build time):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**`server/.env`** (backend only):

```
OPENAI_API_KEY=
PORT=
CLIENT_ORIGIN=
```

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Yes | The **anon/public** key only — never the service-role key. Safe to ship in the frontend bundle; access is enforced by Supabase RLS, not by keeping this secret. |
| `OPENAI_API_KEY` | Only for AI features/OCR | Server-only. Without it, AI Coach/Chat/Insights and scanned-PDF OCR return a clear "server is missing OPENAI_API_KEY" error; everything else still works. |
| `PORT` | No | Backend port. Defaults to `4000`. |
| `CLIENT_ORIGIN` | No | Allowed CORS origin for the backend. Defaults to `http://localhost:5173`. Set this to your real frontend URL in production. |

### Supabase setup requirements

1. Create a Supabase project; enable email/password auth (Authentication → Providers).
2. Create three tables scoped to `auth.users`, each with a `user_id uuid` column:
   - `health_records` (`record_date`, `weight`, `notes`)
   - `daily_checkins` (`checkin_date`, `sleep_hours`, `water_cups`, `exercise_minutes`, `mood`, `notes`)
   - `lab_results` (`test_date`, `test_name`, `category`, `result_value`, `unit`, `reference_low`,
     `reference_high`, `status`, `lab_name`, `notes`, `source_filename`, `import_batch_id`)
3. **Enable Row Level Security on all three tables** and add policies restricting `SELECT`,
   `INSERT`, `UPDATE`, and `DELETE` to `auth.uid() = user_id` (the `INSERT`/`UPDATE` policies need
   a matching `WITH CHECK`, not just `USING`). Without this, the anon key would let any signed-in
   user read or write any other user's rows.
4. Copy the project URL and anon key into `.env` as above.

### Running it

```bash
# Terminal 1 — backend
cd server
npm run dev        # or: npm start

# Terminal 2 — frontend
npm run dev
```

Frontend runs at `http://localhost:5173` (Vite proxies `/api/*` to the backend at `:4000` in dev —
see `vite.config.js`). Backend health check: `GET http://localhost:4000/api/health`.

### Testing

```bash
npm test            # runs the Vitest suite (pure-logic unit tests)
npm run lint         # oxlint
```

See [MANUAL_TESTING.md](MANUAL_TESTING.md) for the manual regression checklist covering
everything an automated test can't (auth flows, mobile layout, keyboard navigation, print output,
backend/AI-down behavior, etc.).

### Build

```bash
npm run build        # outputs static assets to dist/
npm run preview       # serve the production build locally to sanity-check it
```

## Security and privacy design

- The frontend only ever holds the Supabase **anon** key — never a service-role key. Access
  control is enforced by Supabase Row Level Security, not by keeping the anon key secret.
- `OPENAI_API_KEY` lives only in `server/.env` and is never sent to the client.
- Every Supabase query/mutation filters by the signed-in user's id in addition to relying on RLS.
- Uploaded PDFs are held in memory only for the duration of a single request (`multer`
  memory storage) — never written to disk, never persisted anywhere. Only the structured fields
  extracted from a report (test name, value, unit, range, date) are ever saved to the database;
  the raw PDF bytes and extracted page text never leave the request.
- User-entered free text (notes, custom test names) and PDF content are explicitly framed as
  untrusted data in every AI prompt — the model is told never to treat them as instructions.
- AI responses are grounded in facts the app calculates itself (trend direction, percent change,
  in/out-of-range status) — the model is instructed never to recalculate or contradict them, and
  never to diagnose, recommend medication changes, or invent history not present in the data.
- Backend request bodies and array payloads are size-capped; AI prompt context is trimmed to the
  most recent/relevant records rather than sending a user's entire history.
- The AI and PDF-import endpoints are rate-limited per IP.
- Errors returned to the client and written to server logs are sanitized — never raw stack traces,
  full error objects, request bodies, or record contents.

## PDF import limitations

- 10 MB / 30-page hard limit per upload.
- Text-based reports are parsed with layout heuristics tuned against real Quest and Sun Clinical
  Laboratories reports — an unfamiliar lab's layout may extract partially or not at all; **always
  review every draft row against the original report before saving.**
- A known, disclosed limitation: when a result has no unit on its own line and only a trailing
  flag letter (e.g. a bare "H"), that letter can be misread as a unit instead of a flag in rare
  layouts — visible and correctable in the draft-review screen.
- Reference ranges are only inherited from the line *immediately* preceding an analyte; a range
  separated from its analyte by intervening footnote text is not picked up.

## OCR limitations

- Only used as a fallback when a PDF has no usable text layer (a scanned/photographed report).
- Capped at 8 pages per import (`MAX_OCR_PAGES`) to bound OpenAI vision cost.
- Vision-model OCR is inherently probabilistic: dense pages with adjacent ambiguous rows
  (e.g. a qualitative "NEGATIVE" row directly next to a numeric one) can occasionally misattribute
  a value between two rows on repeated runs of the *same* file, even at temperature 0. Every OCR
  row carries a confidence label (High/Medium/Low); Low-confidence rows start unselected. This is
  a limitation of the underlying vision model, not something further prompt engineering reliably
  eliminates — always review OCR-derived rows carefully.

## Production architecture recommendation

Static frontend build (`dist/`) served from a CDN/static host, talking to a small always-on Node
process for the backend (it needs to stay warm for OCR's multi-second vision calls and hold
`OPENAI_API_KEY`), with Supabase as the managed Postgres + auth layer. See the deployment plan
below for specifics.

---

**Educational use disclaimer**: Health MPV is a personal tracking and educational tool. It does
not provide medical advice, diagnosis, or treatment, and its AI features are explicitly instructed
to avoid diagnostic claims and defer to licensed clinicians. Reference ranges shown are general
suggestions only — always use the range printed on your actual lab report. If you experience a
medical emergency, contact emergency services immediately, not this app.
