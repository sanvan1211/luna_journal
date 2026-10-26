// Pre-written sample replies for demo mode, one set per sample entry. Demo mode has no account, so
// Luna's AI can't run; these show what a reflection conversation looks like. Every one is shown with
// the "Sample reply (demo mode)" badge. They only restate what the sample entry says, ask one light
// question, and never claim to have understood what the visitor typed.

const SAMPLES = {
  "demo-01": {
    first: "You closed tonight, the 6 o'clock rush was a lot, and by the end you and Maya had a rhythm. You also wrote that someone left a note saying you made their day. What stayed with you most from the shift?",
    follow: [
      "Thanks for adding that. You also wrote that you need to stop skipping dinner before shifts. Is that something you want to plan for next time?",
      "That's worth keeping in your entry. You ended by saying you're grateful the night ended on that note. Anything else from tonight you want to remember?",
    ],
    about: "my closing shift, the rush at 6, and the note someone left",
  },
  "demo-02": {
    first: "You've got a chem test tomorrow. You wrote that stoichiometry feels fine, gas laws feel shaky, and you're stressed but less than last time. What's the one thing you most want to get done tonight?",
    follow: [
      "Got it. You already redid the practice set, and asking Ms. Patel about question 14 and sleeping before midnight are still open. Does one of those feel more doable right now?",
      "Thanks for sharing that. You said you want to plan the morning so you're not rushing. What would that plan look like?",
    ],
    about: "my chem test and how I'm getting ready for it",
  },
  "demo-03": {
    first: "You ran a 21:48 at practice and Coach said your pacing looks steady. You also wrote that you laughed with Jordan the whole cooldown. What part of today do you want to remember?",
    follow: [
      "That makes sense. You wrote that you always feel lighter after a run. Is that how today felt too?",
      "Thanks for adding that. Is there anything about the race or the cooldown you'd want to write down before it fades?",
    ],
    about: "running my first 5k under 22 minutes",
  },
  "demo-04": {
    first: "You slept in, made pancakes with your little brother, and read for an hour, without opening anything about college. You wrote that you want more days like this. What made today feel the way it did?",
    follow: [
      "Thanks for sharing that. You said you didn't feel guilty about taking the day. What helped with that?",
      "That's good to have in your words. Is there a small piece of today you could bring into a busier week?",
    ],
    about: "a quiet day at home with my brother",
  },
  "demo-05": {
    first: "You're on your third draft of the Common App essay, and you wrote that it still sounds like you're trying to impress someone. You're thinking about writing about the bike you rebuilt with your dad. What draws you to that story?",
    follow: [
      "Thanks for adding that. Your counselor told you to write the version only you could write. What do you think that version would include?",
      "Makes sense. You also wrote that you're worried about running out of time. What would a first small step on the new draft be?",
    ],
    about: "my Common App essay and the bike story",
  },
  "demo-06": {
    first: "You sat with Priya and Sam today instead of eating in the library. It was awkward for about five minutes and then it wasn't. How are you thinking about Thursday's study session?",
    follow: [
      "Thanks for sharing that. What made it stop feeling awkward, if you had to guess?",
      "That's worth writing down. Is there anything you want to remember about how today went?",
    ],
    about: "sitting with Priya and Sam at lunch",
  },
  "demo-07": {
    first: "You skipped practice because of a headache and spent the afternoon scrolling, and you wrote that you felt worse for it. You left yourself a note that even a short walk would have helped. Want to say more about that afternoon?",
    follow: [
      "Thanks for adding that. Is there something you'd want to try next time a day like this comes up?",
      "That's helpful to have in your own words. Anything else you want to note before you close this entry?",
    ],
    about: "skipping practice and the afternoon after",
  },
  "demo-08": {
    first: "You worked 4 to 9 and did homework until 12:40, and you wrote that there's too much pressure this week. You made a plan: drop the Wednesday shift, read on the bus, bed by 11:30. Which part of the plan feels most important?",
    follow: [
      "Thanks for sharing that. You already did the reading on the bus. How did that go?",
      "That makes sense. Is there anything that would make asking your manager about Wednesday easier?",
    ],
    about: "a long shift, late homework, and my plan for next week",
  },
  "demo-09": {
    first: "Four mile repeats, and your legs were dead by the last one, but you finished. You wrote that you felt calm the rest of the night and thankful Coach Rivera didn't let you quit. What kept you going on the last one?",
    follow: [
      "Thanks for adding that. Is the calm feeling something you want to remember for harder days?",
      "That's good to have written down. Anything else about practice you want to keep?",
    ],
    about: "mile repeats at practice",
  },
  "demo-10": {
    first: "You surprised your mom with dinner for her birthday, your dad cried during the toast, and then everyone did. You wrote that you're grateful for your family even when the house is loud. What moment do you want to hold on to?",
    follow: [
      "Thanks for sharing that. Is there anything from the night you'd want to tell your mom?",
      "That's a nice thing to have in your words. Anything else about the dinner you want to remember?",
    ],
    about: "my mom's birthday dinner",
  },
  "demo-11": {
    first: "You narrowed your list to nine schools, and you keep changing your mind about going far away. You wrote that you want to be somewhere you can still come home some weekends. What do you want to ask your parents when you talk?",
    follow: [
      "Thanks for adding that. What matters most to you about being able to come home?",
      "That makes sense. Is there anything that would help you feel more sure either way?",
    ],
    about: "my college list and how far from home I want to be",
  },
  "demo-12": {
    first: "You ran in the rain with Jordan and wrote that it felt like a movie. You also left yourself a reminder that hard weeks get lighter when you move. What made this run stand out?",
    follow: [
      "Thanks for sharing that. Is that reminder something you want to come back to on a hard week?",
      "That's worth keeping. Anything else about the run you want to remember?",
    ],
    about: "running in the rain with Jordan",
  },
  "demo-13": {
    first: "First training shift at the new job. You wrote that everyone's nice, you're nervous about the register, and the trainer said it takes a week to stop feeling lost. What are you most curious about for your next shift?",
    follow: [
      "Thanks for adding that. Is there one thing you want to practice on the register next time?",
      "That makes sense. Anything else about your first day you want to remember?",
    ],
    about: "my first training shift at the new job",
  },
};

// For entries the visitor writes themselves in demo mode.
const GENERIC = {
  first: "This is a pre-written sample, since Luna's AI only runs with an account. With an account, Luna would reflect on what you wrote here. What part of this day stands out most to you?",
  follow: [
    "Thanks for adding that. With an account, Luna would answer from your entry and your messages. Is there anything else about this day you'd want to remember?",
    "Another sample reply. If you added one more line to this entry, what would it say?",
  ],
  about: "this entry",
};

// Third reply for every entry, so a short conversation never repeats itself.
const WRAP_UP = "That sounds like a good place to pause. If you'd like, you can add a short summary of this conversation to your entry, or keep writing here.";

const pick = (entryId) => SAMPLES[entryId] || GENERIC;

export const sampleFirst = (entryId) => pick(entryId).first;
export const sampleFollow = (entryId, turn) => { const f = [...pick(entryId).follow, WRAP_UP]; return f[turn % f.length]; };

/** A first-person summary built only from what the entry is about and the visitor's own messages. */
export function sampleSummary(entryId, messages) {
  const said = messages.filter((m) => m.role === "user").map((m) => m.content.trim().replace(/\s+/g, " ")).filter(Boolean);
  return `I talked with Luna about ${pick(entryId).about}.${said.length ? ` What I added: ${said.join(" ")}` : ""}`;
}
