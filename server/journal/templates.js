// Starting structures for new entries, like Notion templates. These are
// empty prompts to write into — never pre-written journal content.

import { block } from './blocks.js';

const h = (text) => block('heading_2', text);
const p = () => block('paragraph');

export const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank page',
    description: 'Start from nothing.',
    icon: null,
    build: () => [p()],
  },
  {
    id: 'daily',
    name: 'Daily check-in',
    description: 'How you’re arriving, what happened, what’s next.',
    icon: '🌙',
    build: () => [
      h('How I’m arriving today'), p(),
      h('What happened'), p(),
      h('What’s on my mind'), p(),
      block('to_do', 'One small thing for tomorrow'),
    ],
  },
  {
    id: 'gratitude',
    name: 'Three good things',
    description: 'Small things that went okay.',
    icon: '🌱',
    build: () => [
      block('numbered_list_item'),
      block('numbered_list_item'),
      block('numbered_list_item'),
      h('Why they mattered'), p(),
    ],
  },
  {
    id: 'brain-dump',
    name: 'Brain dump',
    description: 'Get everything out of your head, unsorted.',
    icon: '🌀',
    build: () => [block('bulleted_list_item')],
  },
  {
    id: 'weekly',
    name: 'Weekly look-back',
    description: 'What the week was like, and what you want from the next one.',
    icon: '🗓️',
    build: () => [
      h('Highs'), block('bulleted_list_item'),
      h('Lows'), block('bulleted_list_item'),
      h('Something I learned'), p(),
      h('Next week I want to…'), block('to_do'),
    ],
  },
];

export function listTemplates() {
  return TEMPLATES.map(({ id, name, description, icon }) => ({ id, name, description, icon }));
}

export function buildTemplate(id) {
  const tpl = TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
  return { icon: tpl.icon, blocks: tpl.build() };
}
