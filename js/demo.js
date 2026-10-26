// Sample journal for demo mode. Never written to Supabase.
// Dates are fixed (2026) to match what each entry describes.
const at = (month, day, hour = 21) => new Date(2026, month - 1, day, hour, 12, 0, 0).toISOString();
const E = (id, when, title, mood, tags, content) => ({
  id, title, mood, tags, content,
  user_id: "demo", created_at: when, updated_at: when,
});

// Rewritten from a real student's journal with names and private details removed.
export function makeDemoData() {
  const entries = [
    E("demo-01", at(10, 26, 3), "Finished the essay", "Proud", ["college", "writing"],
`It's 3am and the main essay is done. I reread the ending three times and it finally sounds like me instead of an application. I put on a favorite song, closed the laptop, and went to bed with a quiet feeling that I actually finished something that mattered.`),
    E("demo-02", at(10, 24), "Four hours with Luna", "Proud", ["luna", "coding"],
`I started the morning lost on my app and ended the day with a frontend ready to deploy. Backend tomorrow, then the demo video. I drank a lot of water, played piano on a break, and kept the music loud. Then a busy shift at work with decent tips, and I sketched drink ideas on the back of an order slip.`),
    E("demo-03", at(10, 23), "Chai and boba", "Hopeful", ["gym", "cafe"],
`Chest and arms at the gym with a friend, and I did two coding labs between sets. Had a drink idea at work: chai with brown sugar and boba, maybe a milk tea line too. I keep imagining my own small cafe with succulents and a bunny corner, called Burrow. It feels good to have something I'm building toward.`),
    E("demo-04", at(10, 21), "Experiments at the espresso bar", "Calm", ["work", "cafe"],
`Tried a brown sugar shaken espresso frappuccino and a pink drink smoothie bowl on my shift. Both turned out better than expected. I also presented a slide at my club meeting, and a few members came up afterward with questions. I didn't expect to feel that comfortable talking.`),
    E("demo-05", at(10, 19), "Day off", "Calm", ["rest", "school"],
`No school today. Slept well, did laundry (everything smells like campfire smoke), and finished week one of my probability course. Took a walk in the afternoon with the leaves changing. I'm not as excited as I was in the summer, but I feel more settled than I did a few weeks ago.`),
    E("demo-06", at(10, 17), "Last campout", "Tired", ["scouts"],
`Hiked up to the old mansion for the views, picked parsley, chives and rosemary from the garden, and showed the younger scouts how to sharpen an axe. The nights were brutal: a hard wooden platform, no pillow, and a freezing temperature. I used my backpack for a pillow and barely slept. Worth it for the stories.`),
    E("demo-07", at(10, 15), "Quiz didn't go how I thought", "Restless", ["school"],
`Got a 70 on my calculus quiz when I thought I'd done much better. Last year I got a 74 on a first quiz and a 98 on the test, so I'm trying to stay steady. My first live session of the probability course was great, and the instructor taught it like we were five. Packed for the campout tonight.`),
    E("demo-08", at(10, 13), "Board of review", "Proud", ["scouts"],
`Passed my Eagle board of review today. The middle was rough, but the end was good, and one reviewer said my cooling project idea was important. On the drive home I got a little teary, the happy kind. The whole scouting journey is wrapping up and I'm grateful for it.`),
    E("demo-09", at(10, 12), "Run and rewrite", "Hopeful", ["running", "college"],
`Went on a run using the 40% rule, which means you're usually good for much more than your brain says. Spent the afternoon refining the ending of my personal statement and starting the first short answer for another college. Learned the first Bayesian probability module during a quiet stretch at work.`),
    E("demo-10", at(10, 11), "Rainy Sunday", "Restless", ["school", "cafe"],
`Too rainy to run, so I took my first cybersecurity unit tests instead. Realized social engineering is really just psychology. At work I made two cortados, the most in a month, plus a mango lemonade I invented as a joke, and someone actually ordered it.`),
    E("demo-11", at(7, 16), "Shipped the site", "Proud", ["voyage", "cad"],
`We deployed the new website today, though the contact email still needs fixing. Built a prospect list and started planning cold outreach. In the evening I redid my Mac mini cooling stand in CAD, this time using airflow optimization, and barely needed help. Also submitted my poster. Good day.`),
    E("demo-12", at(7, 4), "Fireworks in the city", "Hopeful", ["travel"],
`Waffles in the morning, then two museums and a long walk around the city. It was hot and rained a couple of times. The fireworks over the rivers, with the stadium and the bridges behind them, were one of the best shows I've ever seen. Got a free towel too.`),
  ];

  // Sample "Luna noticed" insights, written from these entries only. Each links to its entries.
  const insights = [
    {
      id: "demo-ins-1", user_id: "demo",
      insight: "Building things shows up again and again.",
      explanation: "You wrote about ending the day \"with a frontend ready to deploy,\" a cafe you keep imagining called Burrow, a cooling project idea a reviewer called important, and redoing a cooling stand in CAD. This is a pattern in your words, not a conclusion about you.",
      confidence: "high",
      supporting_entry_ids: ["demo-02", "demo-03", "demo-08", "demo-11"],
      created_at: at(10, 26, 9),
    },
    {
      id: "demo-ins-2", user_id: "demo",
      insight: "Drink and recipe experiments come up at work.",
      explanation: "You sketched drink ideas on an order slip, thought up chai with brown sugar and boba, tried a brown sugar shaken espresso frappuccino, and invented a mango lemonade that someone actually ordered.",
      confidence: "high",
      supporting_entry_ids: ["demo-02", "demo-03", "demo-04", "demo-10"],
      created_at: at(10, 25),
    },
    {
      id: "demo-ins-3", user_id: "demo",
      insight: "Several entries mark something finishing.",
      explanation: "The last campout, scouting \"wrapping up,\" refining the ending of your personal statement, and finally finishing the main essay at 3am. In these entries you also wrote \"grateful,\" \"worth it,\" and \"something that mattered.\" Luna can only see what you wrote, so this is one way to read it, not the only one.",
      confidence: "medium",
      supporting_entry_ids: ["demo-06", "demo-08", "demo-09", "demo-01"],
      created_at: at(10, 25, 9),
    },
  ];

  const memory = [
    { id: "demo-mem-1", user_id: "demo", type: "theme", content: "Building things: an app, a cafe idea, CAD projects", created_at: at(10, 24) },
    { id: "demo-mem-2", user_id: "demo", type: "theme", content: "Drink experiments at work", created_at: at(10, 23) },
    { id: "demo-mem-3", user_id: "demo", type: "theme", content: "Scouting wrapping up", created_at: at(10, 17) },
    { id: "demo-mem-4", user_id: "demo", type: "goal", content: "Deploy the backend, then record the demo video", created_at: at(10, 24) },
    { id: "demo-mem-5", user_id: "demo", type: "strategy", content: "A run or a walk when the day feels unsettled", created_at: at(10, 19) },
  ];

  return { entries, insights, memory };
}
