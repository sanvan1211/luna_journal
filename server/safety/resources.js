// Verified support resources. Luna points people here; it never acts as the
// support itself. Only add entries whose contact details you've checked against
// the organization's own site, and update `verified` when you do.

export const SUPPORT_RESOURCES = {
  verified: '2026-10-12',
  urgent: {
    title: 'If you might be in danger right now',
    body: 'Call 911 or go to the nearest emergency room.',
  },
  resources: [
    {
      id: '988',
      name: '988 Suicide & Crisis Lifeline',
      description: 'Free, confidential support 24/7 for anyone who is struggling — you don’t have to be in crisis to reach out.',
      contacts: [
        { label: 'Call or text', value: '988', href: 'tel:988' },
        { label: 'Chat', value: '988lifeline.org', href: 'https://988lifeline.org' },
      ],
    },
    {
      id: 'crisis-text-line',
      name: 'Crisis Text Line',
      description: 'Text with a trained volunteer crisis counselor, 24/7.',
      contacts: [{ label: 'Text', value: 'HOME to 741741', href: 'sms:741741?&body=HOME' }],
    },
    {
      id: 'safe2say',
      name: 'Safe2Say Something (Pennsylvania)',
      description: 'Anonymous reporting for Pennsylvania students worried about their own or someone else’s safety.',
      contacts: [
        { label: 'Call', value: '1-844-723-2729', href: 'tel:18447232729' },
        { label: 'Web', value: 'safe2saypa.org', href: 'https://www.safe2saypa.org' },
      ],
    },
    {
      id: 'people',
      name: 'People you already know',
      description: 'A school counselor, a parent or guardian, a teacher, a coach, or a friend you trust. Talking to someone in person counts.',
      contacts: [],
    },
  ],
};
