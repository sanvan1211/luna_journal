// "Need someone?" resources. Low-key, always reachable, never alarming.
export function supportPanel() {
  return `<section class="card support" id="support" tabindex="-1" aria-labelledby="support-h">
    <div class="eyebrow">Need someone?</div>
    <h2 id="support-h" style="margin-top:6px">People who will listen, any time</h2>
    <ul>
      <li><strong>988 Suicide &amp; Crisis Lifeline</strong><span>Call or text <a href="tel:988">988</a>. Free, 24/7.</span></li>
      <li><strong>Crisis Text Line</strong><span>Text <a href="sms:741741&body=HOME">HOME to 741741</a>.</span></li>
      <li><strong>Safe2Say Something PA</strong><span>Anonymous reporting: <a href="https://www.safe2saypa.org" target="_blank" rel="noopener">safe2saypa.org</a> or 1-844-723-2729.</span></li>
      <li><strong>Someone you know</strong><span>Talk to your school counselor or a trusted adult.</span></li>
    </ul>
    <p class="foot">Luna is a journal, not a therapist, and can't respond in an emergency. If you're in danger, call 911.</p>
  </section>`;
}

export function supportMini() {
  return `<div class="support-mini"><span>Need someone to talk to? Call or text <a href="tel:988">988</a>, or text HOME to 741741.</span><a href="#/dashboard?focus=support" class="small">More support</a></div>`;
}

/** Shown when safety-check flags something. Gentle, specific, no alarm styling. */
export function safetyNote() {
  return `<section class="card safety-note" role="note" style="margin-bottom:18px">
    <div class="eyebrow">A note from Luna</div>
    <p style="margin:8px 0 12px;font:400 17px/1.6 var(--serif)">Some of what you wrote sounds really heavy. You don't have to carry it alone. A real person can help right now.</p>
    <div class="chips">
      <a class="btn btn-primary btn-sm" href="tel:988">Call 988</a>
      <a class="btn btn-sm" href="sms:988">Text 988</a>
      <a class="btn btn-sm" href="sms:741741&body=HOME">Text HOME to 741741</a>
    </div>
    <p class="small muted" style="margin:12px 0 0">You can also talk to your school counselor or a trusted adult.</p>
  </section>`;
}
