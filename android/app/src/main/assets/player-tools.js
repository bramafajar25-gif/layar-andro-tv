// Runs inside the source WebView; the source still handles its playback session.
function installLayarPlayer(options) {
  if (!document.body) return;
  if (window.__layarPlayerInjected) return;
  window.__layarPlayerInjected = true;

  try {
    window.open = function() { return null; };
  } catch (_) {}

  var style = document.createElement('style');
  style.textContent = atob(options.css);
  (document.head || document.documentElement).appendChild(style);

  var clicked = new WeakSet();
  var videos = new WeakSet();
  var queued = false;
  function visibleEnabled(button) {
    return !button.disabled && button.getAttribute('aria-disabled') !== 'true' && button.getClientRects().length > 0;
  }
  function clickOnce(button) {
    if (clicked.has(button) || !visibleEnabled(button)) return;
    clicked.add(button);
    button.click();
  }
  function startVideoOnce(video) {
    if (videos.has(video)) return;
    videos.add(video);
    if (!video.paused || video.ended) return;
    function play() {
      if (!video.paused || video.ended) return;
      var promise = video.play();
      if (promise && promise.catch) promise.catch(function() {});
    }
    if (video.readyState > 0) play();
    else video.addEventListener('loadedmetadata', play, { once: true });
  }
  function update() {
    queued = false;
    var target = document.querySelector('.hero-player-playing') || document.querySelector('.detail-backdrop');
    var previous = document.querySelector('[data-layar-player]');
    if (previous !== target) {
      if (previous) previous.removeAttribute('data-layar-player');
      if (target) target.setAttribute('data-layar-player', '');
    }
    document.body.classList.toggle('layar-player-active', !!target);
    if (!target) return;

    if (options.blockAds) {
      var buttons = target.querySelectorAll('button, .skip-button, .jw-skip');
      for (var i = 0; i < buttons.length; i++) {
        if (/^(skip ad|skip ads|lewati iklan|lanjutkan ke video)$/i.test((buttons[i].textContent || '').trim())) {
          clickOnce(buttons[i]);
        }
      }
    }
    // Only initial play overlays: generic Play/Replay labels can reload or pause a film.
    var overlays = target.querySelectorAll('.hero-player-play, .vjs-big-play-button, .jw-display-icon-container');
    for (var j = 0; j < overlays.length; j++) clickOnce(overlays[j]);

    var elements = target.querySelectorAll('video');
    for (var k = 0; k < elements.length; k++) startVideoOnce(elements[k]);
  }
  new MutationObserver(function() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }).observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['disabled', 'aria-disabled']
  });
  update();
}
