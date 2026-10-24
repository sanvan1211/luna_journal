// Sample journal for demo mode. Clearly fake, never written to Supabase.
// Dates are relative to "now" so the dashboard always looks alive.

const ago = (days, hour = 21) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 12, 0, 0);
  return d.toISOString();
};

const E = (id, days, title, mood, tags, content) => ({
  id, title, mood, tags, content,
  user_id: "demo", created_at: ago(days), updated_at: ago(days),
});

export function makeDemoData() {
  const entries = [
    E("demo-01", 0, "Long shift, good ending", "Tired", ["work"],
`Closed tonight. The rush at 6 was **a lot**, but Maya and I had a rhythm going by the end.

- Remembered three regulars' orders without asking
- Got through it without snapping at anyone
- Need to stop skipping dinner before shifts

> Small win: someone left a note that said "you made my day."

I'm grateful the night ended on that.`),
    E("demo-02", 1, "Chem test tomorrow", "Restless", ["school"],
`## What I know
- Stoichiometry is fine
- Gas laws are shaky

## What I'll do
- [x] Redo the practice set
- [ ] Ask Ms. Patel about question 14
- [ ] Sleep before midnight

Honestly stressed, but less than last time. Going to plan the morning so I'm not rushing.`),
    E("demo-03", 2, "Track — first 5k under 22", "Proud", ["running"],
`Ran a **21:48** at practice. Coach said my pacing finally looks steady.

I always feel lighter after a run. Talked with Jordan the whole cooldown and laughed more than I have all week.`),
    E("demo-04", 3, "Quiet Sunday", "Calm", ["home"],
`Slept in, made pancakes with my little brother, and read for an hour. Didn't open a single tab of college stuff and I don't feel guilty about it. I want more days that feel like this.`),
    E("demo-05", 6, "Essay draft is not it", "Stretched thin", ["college"],
`Third draft of the Common App essay and it still sounds like I'm trying to impress someone.

> Write the version only you could write.

My counselor said that. Going to try writing about the bike I rebuilt with my dad instead. Worried I'm running out of time though.`),
    E("demo-06", 8, "Lunch table", "Hopeful", ["friends"],
`Sat with Priya and Sam today instead of eating in the library. It was awkward for about five minutes and then it wasn't. We're going to study together Thursday.`),
    E("demo-07", 10, "Didn't run today", "Low", ["running"],
`Skipped practice because of a headache. Spent the afternoon scrolling and felt worse for it. Note to self: even a short walk would have helped.`),
    E("demo-08", 13, "Shift + homework", "Tired", ["work", "school"],
`Worked 4–9, then homework until 12:40. Too much pressure this week. Plan for next week:

- [ ] Ask manager to drop the Wednesday shift
- [x] Do reading on the bus
- [ ] Bed by 11:30 on school nights`),
    E("demo-09", 16, "Mile repeats", "Content", ["running"],
`4 × 1 mile. Legs were dead by the last one but I finished. Felt calm the rest of the night. Thankful for Coach Rivera not letting us quit.`),
    E("demo-10", 20, "Mom's birthday", "Content", ["family"],
`We surprised her with dinner. Dad cried during the toast, which made everyone cry. Grateful for my family, even when the house is loud.`),
    E("demo-11", 24, "College list", "Unsure", ["college"],
`Narrowed it to 9 schools. I keep changing my mind about going far away. I want to be somewhere I can still come home some weekends. Will talk to my parents about it.`),
    E("demo-12", 30, "Rain run", "Calm", ["running"],
`Ran in the rain with Jordan. Felt like a movie. Need to remember that hard weeks get lighter when I move.`),
    E("demo-13", 37, "New job", "Hopeful", ["work"],
`First training shift. Everyone's nice. Nervous about the register but the trainer said it takes a week to stop feeling lost.`),
  ];

  const insights = [
    {
      id: "demo-ins-1", user_id: "demo",
      insight: "Your entries after a run tend to use calmer, lighter language.",
      explanation: "In four entries that mention running, you wrote words like \"lighter,\" \"calm,\" and \"thankful.\" The one day you skipped practice, you wrote that you felt worse. This is a pattern in your words, not a conclusion about you.",
      confidence: "medium",
      supporting_entry_ids: ["demo-03", "demo-09", "demo-12", "demo-07"],
      created_at: ago(1),
    },
  ];

  const memory = [
    { id: "demo-mem-1", user_id: "demo", type: "theme", content: "Balancing shifts and school", created_at: ago(5) },
    { id: "demo-mem-2", user_id: "demo", type: "theme", content: "Running as a reset", created_at: ago(5) },
    { id: "demo-mem-3", user_id: "demo", type: "theme", content: "Making new friends", created_at: ago(7) },
    { id: "demo-mem-4", user_id: "demo", type: "goal", content: "Bed by 11:30 on school nights", created_at: ago(13) },
    { id: "demo-mem-5", user_id: "demo", type: "strategy", content: "A short walk when the day feels heavy", created_at: ago(10) },
  ];

  return { entries, insights, memory };
}
