// Runs before first paint (plain script, not a module) so the saved paper
// theme applies without a flash. The preference lives only in this browser.
(function () {
  var theme = 'night';
  try {
    var saved = localStorage.getItem('luna-theme');
    if (saved === 'day' || saved === 'night') theme = saved;
  } catch (e) { /* storage blocked: use the default */ }
  document.documentElement.dataset.theme = theme;
})();
