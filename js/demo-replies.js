// Pre-written sample replies for demo mode, one set per sample entry. Demo mode has no account, so
// Luna's AI can't run; these show what a reflection conversation looks like. Every one is shown with
// the "Sample reply (demo mode)" badge. They only restate what the sample entry says, ask one light
// question, and never claim to have understood what the visitor typed.

const SAMPLES = {
  "demo-01": {
    first: "It's 3am and the main essay is done. You wrote that the ending finally sounds like you instead of an application, and that you went to bed with a quiet feeling of finishing something that mattered. What changed in the ending this time?",
    follow: [
      "Thanks for adding that. You reread the ending three times before closing the laptop. Is there a line from it you want to keep in this entry?",
      "That's worth writing down. What do you want to remember about tonight when you look back at this later?",
    ],
    about: "finishing my main college essay at 3am",
  },
  "demo-02": {
    first: "You started the morning lost on your app and ended with a frontend ready to deploy. Then a busy shift with decent tips, and drink ideas sketched on an order slip. What helped most to get from lost to ready?",
    follow: [
      "Thanks for sharing that. You wrote that the backend is tomorrow, then the demo video. Which of those feels bigger right now?",
      "Makes sense. You took a piano break in the middle of it. Is that something you want to keep doing on long work days?",
    ],
    about: "a long day building my app, then a shift at work",
  },
  "demo-03": {
    first: "You did two coding labs between sets at the gym, then had a drink idea at work: chai with brown sugar and boba. You also wrote about a cafe you keep imagining, called Burrow. What does Burrow look like when you picture it?",
    follow: [
      "Thanks for adding that. You wrote that it feels good to have something you're building toward. What's one small step toward it?",
      "That's a nice thing to have in your words. Do you want to write down the milk tea line idea before you forget it?",
    ],
    about: "a drink idea and the cafe I keep imagining",
  },
  "demo-04": {
    first: "You tried two new drinks on your shift and both turned out better than expected. You also presented a slide at your club meeting, and wrote that you didn't expect to feel that comfortable talking. What do you think made it feel comfortable?",
    follow: [
      "Thanks for sharing that. A few members came up afterward with questions. Was there one you liked answering?",
      "That makes sense. Which of the two drinks would you make again?",
    ],
    about: "drink experiments on my shift and presenting at my club",
  },
  "demo-05": {
    first: "A day off: you slept well, did laundry, finished week one of your probability course, and took a walk with the leaves changing. You wrote that you feel more settled than a few weeks ago. What do you think is helping with that?",
    follow: [
      "Thanks for adding that. You also wrote that you're not as excited as you were in the summer. Do you want to say more about that?",
      "That's worth keeping. Is there anything from today you'd want more of in a regular week?",
    ],
    about: "a quiet day off",
  },
  "demo-06": {
    first: "Your last campout: the hike to the old mansion, herbs from the garden, and showing the younger scouts how to sharpen an axe. The nights were brutal and you barely slept, but you wrote it was worth it for the stories. Which story do you want to remember?",
    follow: [
      "Thanks for sharing that. Since this was the last campout, is there anything you want to write down about it before it fades?",
      "That's good to have in your words. Anything else from the trip you want to keep?",
    ],
    about: "my last campout with the scouts",
  },
  "demo-07": {
    first: "You got a 70 on a calculus quiz when you thought you'd done much better. You remembered getting a 74 on a first quiz last year and a 98 on the test, and wrote that you're trying to stay steady. What does staying steady look like this week?",
    follow: [
      "Thanks for adding that. You also wrote that your first live probability session was great. What made it work for you?",
      "Makes sense. Is there anything you want to try before the next calculus quiz?",
    ],
    about: "a calculus quiz that didn't go how I expected",
  },
  "demo-08": {
    first: "You passed your Eagle board of review today. The middle was rough, the end was good, and one reviewer said your cooling project idea was important. You wrote that you got a little teary on the drive home, the happy kind. What part of today do you want to hold on to?",
    follow: [
      "Thanks for sharing that. You wrote that the whole scouting journey is wrapping up. Is there anything you want to say about it now?",
      "That's a lot to have in one day. Anything about the cooling project idea you want to note?",
    ],
    about: "passing my Eagle board of review",
  },
  "demo-09": {
    first: "You went on a run using the 40% rule, refined the ending of your personal statement, started a short answer for another college, and learned a Bayesian module at work. Which part of the day felt best?",
    follow: [
      "Thanks for adding that. How did the 40% rule feel on the run?",
      "That's worth keeping. What did you change in the ending of your personal statement?",
    ],
    about: "a run and working on my personal statement",
  },
  "demo-10": {
    first: "Too rainy to run, so you took your first cybersecurity unit tests and noticed that social engineering is really just psychology. At work you made two cortados and a mango lemonade you invented as a joke, and someone ordered it. What did you think when they did?",
    follow: [
      "Thanks for sharing that. What made you connect social engineering to psychology?",
      "Makes sense. Would you make the mango lemonade again?",
    ],
    about: "a rainy Sunday of tests and drinks at work",
  },
  "demo-11": {
    first: "You deployed the new website, built a prospect list, and redid your Mac mini cooling stand in CAD using airflow optimization, barely needing help. You also submitted your poster. You called it a good day. What made it good?",
    follow: [
      "Thanks for adding that. You wrote that you barely needed help on the CAD work. How did that feel?",
      "That's worth writing down. You mentioned the contact email still needs fixing. Want to note that for tomorrow?",
    ],
    about: "shipping the website and my CAD cooling stand",
  },
  "demo-12": {
    first: "Waffles, two museums, and a long walk around the city, through heat and a couple of rain showers. You wrote that the fireworks over the rivers were one of the best shows you've ever seen. What do you want to remember about them?",
    follow: [
      "Thanks for sharing that. Is there a moment from the museums you want to keep too?",
      "That sounds like a full day. Anything else from the trip you want to write down?",
    ],
    about: "the Fourth of July in the city",
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
