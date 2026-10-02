Build the frontend for Luna, a private journaling app with AI reflection.
Luna helps people understand what they've written. It is not a therapist
and never diagnoses.

STACK: Use Supabase for auth and database. Enable Row-Level Security so
users can only access their own rows.

DATABASE TABLES:
- entries: id, user_id, title, content (markdown), mood (optional,
  user-selected), tags (text[]), created_at, updated_at
- insights: id, user_id, insight, explanation, confidence
  ('low'|'medium'|'high'), supporting_entry_ids (uuid[]), created_at
- luna_memory: id, user_id, type ('theme'|'goal'|'strategy'), content,
  created_at

PAGES:
1. Journal (Notion-style)
   - Left sidebar: list of entries grouped by month, search box,
     "New entry" button
   - Main area: clean block-style editor with title, markdown formatting
     (headings, bullets, bold, quotes, checkboxes), autosave with a
     subtle "Saved" indicator
   - Optional mood picker at the top of each entry. Mood is self-reported,
     never AI-assigned.
   - Export entry to Markdown

2. Dashboard
   - A few minimal stats: entries this month, writing streak
   - Recurring themes shown as soft tags
   - "Journal language trends" chart (never call it a mood or mental
     health score)
   - "Luna noticed" card showing one insight with a
     "Show me the entries" button that opens the exact supporting entries
   - Low-key "Need someone?" panel, always visible but not alarming

3. Check-in
   - Short guided emotional check-in: 2–4 gentle questions, one at a time
   - The user can save the check-in as a journal entry

4. Ask Luna
   - Chat interface over the user's journal
   - Every answer shows citation chips linking to the source entries

5. Settings / Privacy
   - View and delete Luna's memory items
   - Delete all insights
   - Delete account and all data
   - Plain-language explanation of what is sent to the AI

AI CALLS: Don't call any AI API from the frontend. Call Supabase Edge
Functions named: reflect-entry, generate-insights, ask-luna, check-in,
safety-check. Build loading, empty, and error states for each. If a
function isn't set up yet, show an honest "AI not configured" state.
Never show fake AI responses.

SUPPORT PANEL: Show these resources:
- 988 Suicide & Crisis Lifeline (call or text 988)
- Crisis Text Line (text HOME to 741741)
- Safe2Say Something PA
- "Talk to your school counselor or a trusted adult"

DESIGN:
- Calm, warm, private-feeling
- Dark navy theme with solid colors only: background #0f1b2d,
  cards #16253b, text #e8edf5, muted text #8a9bb4, warm accent #e8c88a
- Rounded cards and generous whitespace
- No gradients, no glassmorphism, no neon "AI" look
- A small Holland Lop bunny mascot, used only in loading and empty states
- Fully responsive and keyboard accessible

DEMO MODE: Add a toggle that loads clearly labeled sample entries
(banner: "Sample data — not a real journal") so judges can try the app
without writing entries. Never mix sample data with real data.
