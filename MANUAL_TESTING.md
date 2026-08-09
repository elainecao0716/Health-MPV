# Manual Regression Checklist — Health MPV

Automated tests (`npm test`) cover the pure-logic pieces: lab status/trend calculation,
reference-range presets, visit summary generation, PDF draft validation, duplicate detection,
one-sided reference ranges, and Quest junk-row rejection. Everything below needs a human, a
browser, and (for a few items) deliberately breaking something on purpose.

Run `npm run dev` (frontend) and `npm run dev` in `server/` (backend) before starting.

## 1. Sign up, sign in, and sign out
- [ ] Sign up with a new email/password (8+ char password required)
- [ ] Sign in with an existing account
- [ ] Sign in with a wrong password — confirm a clear error, not a crash
- [ ] Sign out — confirm you land back on the sign-in screen

## 2. User-data isolation
- [ ] Sign in as a second account (or ask someone else to) and confirm you see **only** that
      account's records, check-ins, and labs — never the first account's data

## 3. Weight CRUD and charts
- [ ] Add a record, edit it, delete it (confirm the delete dialog names the date)
- [ ] Add 2+ records and confirm the Weight Trend chart renders and resizes with the window

## 4. Goal tracking
- [ ] Save a goal weight, confirm progress/stats update, clear the goal

## 5. Daily check-in CRUD
- [ ] Add, edit, and delete a check-in (sleep/water/exercise/mood/notes)

## 6. Lab CRUD, filters, ranges, and trends
- [ ] Add a manual lab result, use a quick-test chip and a favorite, use "Use suggested range"
- [ ] Filter by test name, category, and date range; search
- [ ] Add 2+ results for the same test/unit and confirm the trend chart + reference lines render
- [ ] Add a result in a different unit for the same test and confirm it's excluded from the trend

## 7. Lab Insights
- [ ] "Analyze Selected Test" and "Analyze All Recent Labs" both return a plain-language summary

## 8. Generate Advice (AI Health Coach)
- [ ] Generate advice with at least one record logged

## 9. AI Chat
- [ ] Ask a question, confirm a reply appears and the window auto-scrolls
- [ ] Clear the chat

## 10. Visit Summary, Copy, Print, and Clear
- [ ] Prepare a summary with records + check-ins + labs present
- [ ] Copy to clipboard, paste somewhere to confirm the text is well-formed
- [ ] Print (Cmd/Ctrl+P) — confirm: **only** the summary appears (no nav, buttons, or other
      cards), clean white background, sensible margins, no blank filler pages, "Health MPV —
      Visit Summary" title and generated date/time are visible
- [ ] Clear the summary

## 11. Text PDF import (e.g. a Quest-style report)
- [ ] Upload, extract, confirm rows match the report, save selected rows

## 12. Scanned PDF/OCR import
- [ ] Upload a scanned report, confirm OCR runs and confidence badges appear
- [ ] Confirm a low-confidence row starts unselected

## 13. Draft edit, deselect, duplicate handling, and save
- [ ] Edit a draft field, deselect a row, save — confirm only selected rows save and the
      deselected one remains in the draft
- [ ] Re-import a report containing an already-saved result and confirm the duplicate warning
      appears with working Skip/Save anyway/Compare actions
- [ ] Save every remaining row and confirm the "N of N saved" message stays visible (it used to
      disappear when the draft list emptied — confirm this is fixed)

## 14. Mobile layout
- [ ] At ~375px width: no horizontal scrolling anywhere, cards stack, buttons wrap/full-width,
      the section nav becomes a horizontally-scrollable single row, lab draft rows stay editable

## 15. Keyboard navigation
- [ ] Tab through a form without a mouse; confirm a visible focus ring on every control
- [ ] Tab through the section nav links and confirm Enter jumps to the right section
- [ ] Confirm the PDF "Choose PDF" button works via keyboard (not just drag-and-drop)

## 16. Backend-down behavior
- [ ] Stop the backend (`Ctrl+C` in `server/`) and try Generate Advice / AI Chat / Lab Insights /
      PDF import — confirm a clear "can't reach the server" message, not a silent failure

## 17. AI-service-down behavior
- [ ] Temporarily unset `OPENAI_API_KEY` and restart the backend; try the same AI actions —
      confirm a clear "server is missing OPENAI_API_KEY" style message

## 18. Sign out with unsaved sensitive draft data
- [ ] Upload and extract a PDF, do **not** save it, then click Sign Out — confirm a confirmation
      dialog warns the draft will be discarded, and canceling keeps you signed in with the draft
      intact
