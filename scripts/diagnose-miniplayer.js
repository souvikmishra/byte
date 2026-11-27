// BYTE mini player diagnostics. Dev tool, not part of the extension.
//
// 1. Open a YouTube video and let it play (past any ad).
// 2. Open DevTools > Console (Cmd+Option+J), paste this whole file, press Enter.
//    (Chrome/Brave may ask you to type "allow pasting" first.)
// 3. Search the way that fails (e.g. click a suggestion). Wait ~5 seconds.
// 4. Run  copy(byteReport())  and paste the result to whoever is debugging.
(() => {
  const t0 = performance.now();
  const log = [];
  const ms = () => String(Math.round(performance.now() - t0)).padStart(6) + 'ms';
  const add = msg => log.push(`${ms()} ${msg}`);
  const q = s => document.querySelector(s);
  const n = s => document.querySelectorAll(s).length;
  const app = q('ytd-app');
  const mini = () => !!(app && app.hasAttribute('miniplayer-is-active'));

  const describe = el => {
    const out = [];
    for (let p = el; p && p.tagName && out.length < 6; p = p.parentElement) {
      const cls = typeof p.className === 'string' ? p.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const role = p.getAttribute('role');
      const href = p.getAttribute('href');
      const label = p.getAttribute('aria-label');
      out.push(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (role ? `[role=${role}]` : '') +
        (cls ? '.' + cls : '') + (href ? `[href=${href}]` : '') + (label ? `[aria-label=${label.slice(0, 30)}]` : ''));
    }
    return out.join(' < ');
  };

  const video = () => {
    const p = q('#movie_player');
    const v = p && p.querySelector('video');
    if (!v) return 'no video element';
    let id = null;
    try { id = p.getVideoData && p.getVideoData().video_id; } catch (_) {}
    return `${v.paused ? 'paused' : 'playing'}@${v.currentTime.toFixed(1)}s src=${!!v.src} id=${id} ad=${p.classList.contains('ad-showing')}`;
  };

  const env = {
    url: location.href,
    browser: navigator.userAgent,
    brave: !!navigator.brave,
    signedIn: !!q('#avatar-btn'),
    searchbox: [...document.querySelectorAll('yt-searchbox, ytd-searchbox')].map(e => e.tagName).join(',') || 'NONE',
    searchInput: n('yt-searchbox input[name="search_query"], ytd-searchbox input#search'),
    searchButton: n('yt-searchbox button.ytSearchboxComponentSearchButton, ytd-searchbox button#search-icon-legacy'),
    player: n('#movie_player.html5-video-player'),
    miniplayerButton: n('.ytp-miniplayer-button'),
    miniplayerElement: n('ytd-miniplayer'),
    miniplayerOn: mini(),
    fullscreen: !!document.fullscreenElement,
    extensionStyles: [...document.querySelectorAll('style[id^="byte"]')].map(s => s.id).join(',') || 'NONE (Block Shorts off, or extension not running)',
    video: video(),
  };

  // Real (trusted) clicks: where they land, and whether the page still saw
  // them afterwards. A press the extension intercepts never reaches the page.
  for (const type of ['pointerdown', 'mousedown', 'click']) {
    window.addEventListener(type, e => { if (e.isTrusted) add(`${type} on: ${describe(e.target)}`); }, true);
    window.addEventListener(type, e => { if (e.isTrusted) add(`${type} reached the page (not intercepted)`); }, false);
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.isTrusted) add(`Enter pressed in: ${describe(e.target)}`);
    if (e.key === 'i' && !e.isTrusted) add('extension pressed the "i" mini player shortcut');
  }, true);

  for (const type of ['yt-navigate-start', 'yt-navigate-finish']) {
    document.addEventListener(type, () => add(`${type} at ${location.pathname}${location.search} mini=${mini()} | ${video()}`));
  }
  if (app) {
    new MutationObserver(() => add(`mini player attribute -> ${mini()} | ${video()}`))
      .observe(app, { attributes: true, attributeFilter: ['miniplayer-is-active'] });
  }
  window.addEventListener('error', e => add(`page error: ${e.message}`));

  // Every URL the tab shows (YouTube can switch pages without a navigation
  // event, e.g. going back to a cached list) and the video state whenever it
  // changes, for up to 2 minutes.
  let lastUrl = location.pathname + location.search;
  const urlTimer = setInterval(() => {
    const u = location.pathname + location.search;
    if (u !== lastUrl) { add(`URL -> ${u} mini=${mini()}`); lastUrl = u; }
  }, 20);
  setTimeout(() => clearInterval(urlTimer), 120000);
  let last = '';
  const timer = setInterval(() => {
    const s = video().replace(/@[\d.]+s/, '');
    if (s !== last) { add(`video: ${video()}`); last = s; }
  }, 250);
  setTimeout(() => clearInterval(timer), 120000);

  window.byteReport = () => [
    'ENVIRONMENT', JSON.stringify(env, null, 1),
    'EVENTS', ...log,
    `NOW: url=${location.pathname}${location.search} mini=${mini()} | ${video()}`,
  ].join('\n');
  console.log('%cBYTE diagnostics ready.', 'font-weight:bold',
    'Search the way that fails, wait ~5s, then run:  copy(byteReport())  and paste the result.');
})();
