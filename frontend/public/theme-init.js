// Resolves the colour theme before the first paint (no flash). External file so the strict CSP allows it.
(function () {
  try {
    var choice = localStorage.getItem('cl.theme');
    choice = choice ? JSON.parse(choice) : 'system';
  } catch (e) {
    choice = 'system';
  }
  var dark = choice === 'dark' || (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
