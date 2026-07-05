/* ══════════════════════════════════════════════════════════
   index.js — Page-level JS for Yare Sama
   ──────────────────────────────────────────────────────────
   Contents (in order):
     1.  Scroll-entrance reveal
     2.  Page transitions (exit fade + entry reveal)
     3.  Clean URL normalization
     4.  Active nav highlighting
     5.  Mobile navigation (hamburger)
     6.  Scroll behavior (nav hide/show + back-to-top)
     7.  Reading progress bar
     8.  Typewriter hero effect
     9.  Contact email copy button
    10.  Star canvas background (twinkling parallax stars)
    11.  CSS shooting stars (meteor animations)
    12.  Floating sparkle particles
    13.  Hero mouse parallax
    14.  Custom cursor + sparkle trail
    15.  Ambient fog layer + scroll parallax
    16.  Section mood glow (scroll-driven hue shift)
    17.  Clip-path curtain reveal
    18.  Skill icon staggered entrance
    19.  Homepage section nav (contact highlight on scroll)
    20.  Scroll-position dot indicators (homepage only)
   ══════════════════════════════════════════════════════════ */


/* ── Scroll-entrance reveal — replaces AOS ───────────────── */

(function sectionReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -36px 0px' });
  document.querySelectorAll('.reveal-section').forEach(function (s) { obs.observe(s); });
  window._revealObserver = obs;
}());

/* ── Page Transitions ─────────────────────────────────────────────────────── */

(function pageTransitions() {
  function getPageName(rawPath) {
    return (rawPath || '')
      .split('?')[0]
      .replace(/\.html$/, '')
      .split('/')
      .pop() || 'index';
  }

  /* Exit — intercept internal, cross-page link clicks */
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target.closest('a[href]');
      if (!a) return;

      var href = a.getAttribute('href') || '';

      /* Skip: new-tab, external origins, mailto/tel/data/js schemes */
      if (
        a.target === '_blank' ||
        /^(?:https?:|\/\/|mailto:|tel:|data:|javascript:)/i.test(href) ||
        href === ''
      ) return;

      /* Skip: pure hash fragment links (e.g. #contact) */
      if (href.startsWith('#')) return;

      /* Skip: same-page navigation (e.g. projects.html#top-projects while on /projects) */
      var curPage  = getPageName(window.location.pathname);
      var linkPage = getPageName(href.split('#')[0]);
      if (!linkPage || linkPage === curPage) return;

      /* Trigger exit fade, then navigate */
      e.preventDefault();
      document.body.style.opacity = '0';
      var dest = href;
      setTimeout(function () {
        window.location.href = dest;
      }, 540);
    },
    true /* capture phase — runs before any bubble listeners */
  );

  /* bfcache — restore visibility when user hits back/forward */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      document.body.style.opacity = '';
      document.body.classList.add('page-loaded');
      /* Clear any nav-active states left from before the page transition */
      document.querySelectorAll('.nav-link').forEach(function (l) {
        l.classList.remove('nav-active');
      });
    }
  });

  /* Entry — per-page reveal strategy, keyed on <body id="..."> */
  var bodyId = document.body.id;

  if (bodyId === "top-post") {
    /*
     * Blog post: the blog-post-container innerHTML is set synchronously
     * by utils.js (skeleton), but the browser has not yet painted it.
     * Wait one animation frame so the skeleton is visible before fading in.
     */
    requestAnimationFrame(function () {
      document.body.classList.add("page-loaded");
    });
  } else {
    /*
     * Home  (no body id)  — hero text + avatar are static HTML, visible immediately.
     * Projects             — headings are static; async cards start with skeletons.
     * Publications / Blog  — headings are static; async list starts with skeletons.
     * Reveal synchronously: the content is already rendered in the HTML, no need to wait.
     */
    document.body.classList.add("page-loaded");
  }
}());

/* ── Clean URL normalization ─────────────────────────── */

(function cleanUrl() {
  if (!history || !history.replaceState) return;

  try {
    var url = new URL(window.location.href);

    if (url.pathname.endsWith('.html')) {
      url.pathname = url.pathname.replace(/\.html$/, '');
    }

    if (url.searchParams.has('post')) {
      var postVal = url.searchParams.get('post') || '';
      if (postVal.endsWith('.md')) {
        url.searchParams.set('post', postVal.replace(/\.md$/, ''));
      }
    }

    var newUrl =
      url.pathname +
      (url.search ? '?' + url.searchParams.toString() : '') +
      url.hash;
    history.replaceState(null, '', newUrl);
  } catch (err) {
    console.warn('cleanUrl error', err);
  }
})();

/* ── Active nav highlighting ─────────────────────────── */

(function setActiveNav() {
  var rawPage = window.location.pathname.split('/').pop() || '';
  var page = rawPage || 'index';
  if (page.endsWith('.html')) {
    page = page.slice(0, -5);
  }

  if (page === 'index' || page === '') {
    var contactLink = document.querySelector('.nav-link[href="#contact"]');

    var contactSection = document.getElementById('contact');
    if (contactSection && contactLink) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            document.querySelectorAll('.nav-link').forEach(function (l) {
              l.classList.remove('nav-active');
            });
            contactLink.classList.add('nav-active');
          } else {
            contactLink.classList.remove('nav-active');
          }
        });
      }, { threshold: 0.15 });
      observer.observe(contactSection);
    }
  } else {
    document.querySelectorAll('.nav-link').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (href.startsWith('#')) return;
      var linkFile =
        href.split('#')[0].split('/').pop().replace('.html', '') || 'index';
      var isOnBlogPost = page === 'blog-post' && linkFile === 'blogs';
      if (page === linkFile || isOnBlogPost) {
        link.classList.add('nav-active');
      }
    });
  }
})();

/* ── Mobile navigation — hamburger toggle ─────────────── */

(function mobileNav() {
  var hamburger = document.querySelector('.hamburger');
  var links     = document.querySelector('.links');
  if (!hamburger || !links) return;

  function mobileMenu() {
    hamburger.classList.toggle('active');
    links.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', hamburger.classList.contains('active') ? 'true' : 'false');
  }

  function closeMenu() {
    hamburger.classList.remove('active');
    links.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  hamburger.addEventListener('click', mobileMenu);
  hamburger.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mobileMenu(); }
  });

  document.querySelectorAll('.nav-link').forEach(function (n) { n.addEventListener('click', closeMenu); });

  document.addEventListener('click', function (e) {
    if (
      links.classList.contains('active') &&
      !hamburger.contains(e.target) &&
      !links.contains(e.target)
    ) {
      closeMenu();
    }
  });
}());

/* ── Scroll behavior — nav hide/show + back-to-top ───── */

(function scrollBehavior() {
  var nav      = document.getElementById('nav');
  var arrowBac = document.querySelector('.arrow-bac');

  if (arrowBac) {
    arrowBac.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (!nav) return;

  var prevScroll = window.pageYOffset;
  window.addEventListener('scroll', function () {
    var currentScroll = window.pageYOffset;

    if (currentScroll === 0 || prevScroll > currentScroll) {
      nav.style.top = '0';
    } else {
      nav.style.top = '-90px';
    }
    prevScroll = currentScroll;

    if (currentScroll > 50) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }

    if (arrowBac) {
      if (currentScroll > 300) {
        arrowBac.classList.add('visible');
      } else {
        arrowBac.classList.remove('visible');
      }
    }
  }, { passive: true });
}());

/* ── Reading progress bar ─────────────────────────────── */

(function readProgress() {
  var bar = document.getElementById('read-progress');
  if (!bar) return;
  function update() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    bar.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', Math.round(pct));
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
}());


/* ── Typewriter effect for hero greeting + name ─────── */

(function typewriterHero() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var greetEl = document.getElementById('greeting-text');
  var nameEl  = document.querySelector('.my-name');
  if (!greetEl || !nameEl) return;

  var greetText = greetEl.textContent.trim();
  var nameText  = nameEl.textContent.trim();

  /* Reserve the exact height of .my-name before clearing so the layout
     does not jump when the large text has not yet been typed in.       */
  var reservedHeight = nameEl.offsetHeight;
  nameEl.style.minHeight = reservedHeight + 'px';

  /* Clear both elements */
  greetEl.textContent = '';
  nameEl.textContent  = '';

  /* ── Greeting cursor ── */
  var greetCursor = document.createElement('span');
  greetCursor.className = 'typewriter-cursor';
  greetCursor.setAttribute('aria-hidden', 'true');
  greetEl.appendChild(greetCursor);

  var i     = 0;
  var delay = 820;
  var speed = 48;

  setTimeout(function () {
    var greetInterval = setInterval(function () {
      if (i < greetText.length) {
        greetCursor.before(document.createTextNode(greetText[i]));
        i++;
      } else {
        clearInterval(greetInterval);

        /* ── Fade out greeting cursor, then start typing name ── */
        greetCursor.style.animation = 'tw-cursor-out 0.4s ease forwards';
        setTimeout(function () {
          if (greetCursor.parentElement) greetCursor.parentElement.removeChild(greetCursor);

          var nameCursor = document.createElement('span');
          nameCursor.className = 'typewriter-cursor typewriter-cursor--name';
          nameCursor.setAttribute('aria-hidden', 'true');
          nameEl.appendChild(nameCursor);

          var j         = 0;
          var nameSpeed = 55;

          var nameInterval = setInterval(function () {
            if (j < nameText.length) {
              nameCursor.before(document.createTextNode(nameText[j]));
              j++;
              /* Drop the reserved min-height as soon as the first character
                 appears — the real content now provides the height.        */
              if (j === 1) nameEl.style.minHeight = '';
            } else {
              clearInterval(nameInterval);
              nameEl.style.minHeight = '';

              /* Fade name cursor out after a pause */
              setTimeout(function () {
                nameCursor.style.animation = 'tw-cursor-out 0.5s ease forwards';
                setTimeout(function () {
                  if (nameCursor.parentElement) nameCursor.parentElement.removeChild(nameCursor);
                }, 500);
              }, 2200);
            }
          }, nameSpeed);
        }, 450);
      }
    }, speed);
  }, delay);
}());


/* ── Contact email copy button ──────────────────────── */

(function copyEmailSetup() {
  var copyEmail = document.querySelector('.copy-email');
  if (!copyEmail) return;
  copyEmail.addEventListener('click', function () {
    var email = 'mohammed.khalil.mah@gmail.com';

    function showCopied() {
      var tip = document.createElement('span');
      tip.className = 'copy-email-tip';
      tip.textContent = 'Copied!';
      copyEmail.appendChild(tip);
      setTimeout(function () {
        tip.style.opacity = '0';
        setTimeout(function () {
          if (tip.parentElement) tip.parentElement.removeChild(tip);
        }, 400);
      }, 1200);
    }

    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = email;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopied();
      } catch (e) {}
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(showCopied).catch(fallback);
    } else {
      fallback();
    }
  });
}());


/* ══════════════════════════════════════════════════════════
   ELAINA STAR CANVAS — background twinkling stars only
   ══════════════════════════════════════════════════════════ */

(function elainaStars() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'elaina-stars';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  var ctx = canvas.getContext('2d');
  var stars = [];
  var W, H;
  var mx = 0, my = 0;

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = [];
    var count = Math.max(150, Math.floor((W * H) / 2800));
    for (var i = 0; i < count; i++) {
      stars.push({
        x:     Math.random() * W,
        y:     Math.random() * H,
        r:     Math.random() * 1.4 + 0.2,
        a:     Math.random(),
        da:    (Math.random() * 0.005 + 0.001) * (Math.random() < 0.5 ? 1 : -1),
        gold:  Math.random() < 0.12,
        layer: Math.random() < 0.38 ? 1 : 0   /* 1 = near (more parallax), 0 = far */
      });
    }
  }

  function draw() {
    try {
      ctx.clearRect(0, 0, W, H);
      var cx = W / 2, cy = H / 2;
      for (var i = 0; i < stars.length; i++) {
        var s  = stars[i];
        s.a   += s.da;
        if (s.a <= 0 || s.a >= 1) s.da *= -1;
        var factor = s.layer === 1 ? 0.022 : 0.007;
        var px = s.x + (mx - cx) * factor;
        var py = s.y + (my - cy) * factor;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.gold
          ? 'rgba(212,180,106,' + s.a.toFixed(2) + ')'
          : 'rgba(216,212,232,' + s.a.toFixed(2) + ')';
        ctx.fill();
      }
    } catch (e) {}
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', function () { resize(); initStars(); });
  resize();
  initStars();
  requestAnimationFrame(draw);
}());


/* ══════════════════════════════════════════════════════════
   CSS SHOOTING STARS — runs on the browser compositor
   thread via animation: infinite. Cannot be paused, killed,
   or throttled by rAF or iframe focus loss.
   JS only repositions each element between cycles via the
   animationiteration event (perfectly reliable DOM event).
   ══════════════════════════════════════════════════════════ */

(function cssMeteors() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var METEOR_COUNT = 7;

  function randomize(el) {
    var r    = Math.random();
    var size = r < 0.45 ? 0 : r < 0.78 ? 1 : 2; /* 0=small 1=med 2=large */

    var width  = size === 0 ?  55 + Math.random() * 35
               : size === 2 ? 165 + Math.random() * 85
               :               95 + Math.random() * 55;

    var height = size === 0 ? 1.5 : size === 2 ? 3 : 2;

    var dist   = size === 0 ? 180 + Math.random() * 100
               : size === 2 ? 430 + Math.random() * 160
               :               280 + Math.random() * 130;

    var rot    = 20 + Math.random() * 20;

    var zone   = Math.floor(Math.random() * 3);
    var xPct   = zone === 0 ?        Math.random() * 35
               : zone === 1 ? 22 +   Math.random() * 43
               :               50 +   Math.random() * 42;
    var yPct   = Math.random() * 45;

    el.style.width  = width  + 'px';
    el.style.height = height + 'px';
    el.style.left   = xPct   + 'vw';
    el.style.top    = yPct   + 'vh';
    el.style.setProperty('--rot',  rot  + 'deg');
    el.style.setProperty('--dist', dist + 'px');
  }

  for (var i = 0; i < METEOR_COUNT; i++) {
    (function () {
      var el = document.createElement('div');
      el.className = 'meteor';

      /* Fixed cycle duration per element: 5–9 s total.
         The @keyframes keeps the meteor visible for the first
         25 % of that duration, invisible for the rest (gap). */
      var dur = 5 + Math.random() * 4;
      el.style.animationDuration = dur.toFixed(2) + 's';

      /* Negative delay starts elements already mid-cycle so
         meteors appear immediately on load, staggered.        */
      el.style.animationDelay = -(Math.random() * dur * 0.85).toFixed(2) + 's';

      randomize(el);

      /* CSS custom properties in @keyframes are re-read at the
         start of every new iteration — this is how we get a new
         random position/size each time without touching the
         animation-duration (which would restart the cycle).    */
      el.addEventListener('animationiteration', function () {
        randomize(el);
      });

      document.body.appendChild(el);
    }());
  }
}());


/* ══════════════════════════════════════════════════════════
   ELAINA SPARKLES — floating ✦ particles
   ══════════════════════════════════════════════════════════ */

(function elainaSparkles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var symbols = ['✦', '✧', '⋆', '✩', '✪', '☽'];
  var count = 8;

  for (var i = 0; i < count; i++) {
    (function(idx) {
      var el = document.createElement('span');
      el.className = 'elaina-sparkle';
      el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      el.style.left  = (Math.random() * 95 + 2) + 'vw';
      el.style.top   = (Math.random() * 85 + 5) + 'vh';
      el.style.fontSize = (Math.random() * 10 + 8) + 'px';
      el.style.animationDelay    = (Math.random() * 8) + 's';
      el.style.animationDuration = (Math.random() * 6 + 5) + 's';
      el.style.opacity = '0';
      el.style.color = Math.random() < 0.5 ? '#d4b46a' : '#c4a8e8';
      document.body.appendChild(el);
    })(i);
  }
}());


/* ══════════════════════════════════════════════════════════
   HERO PARALLAX — subtle mouse-driven drift on Elaina
   ══════════════════════════════════════════════════════════ */

(function heroParallax() {
  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var frame    = document.querySelector('.elaina-avatar-frame');
  var heroText = document.querySelector('#home');
  if (!frame) return;

  var raf = null;
  var tx = 0, ty = 0;

  document.addEventListener('mousemove', function (e) {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      var cx = window.innerWidth  / 2;
      var cy = window.innerHeight / 2;
      /* Avatar at 1×, text at 0.3× — layered depth like majotabi.jp */
      tx = ((e.clientX - cx) / cx) * -9;
      ty = ((e.clientY - cy) / cy) * -5;
      frame.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
      if (heroText) {
        heroText.style.setProperty('--hpx', (tx * 0.3).toFixed(2) + 'px');
        heroText.style.setProperty('--hpy', (ty * 0.3).toFixed(2) + 'px');
      }
    });
  }, { passive: true });
}());


/* ══════════════════════════════════════════════════════════
   CUSTOM CURSOR — glowing lavender dot + sparkle trail
   Skipped on touch-only devices.
   ══════════════════════════════════════════════════════════ */

(function elainaCursor() {
  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* Hide system cursor globally; links restore it via CSS cursor: pointer */
  document.documentElement.style.cursor = 'none';

  var dot = document.createElement('div');
  dot.className = 'elaina-cursor elaina-cursor--hidden';
  document.body.appendChild(dot);

  var canvas = document.createElement('canvas');
  canvas.id = 'elaina-cursor-trail';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var W, H;
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  var mx = -200, my = -200;
  var trail = [];
  var sparks = [];

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
    dot.classList.remove('elaina-cursor--hidden');

    trail.push({ x: mx, y: my, a: 1, r: Math.random() * 2.5 + 0.5 });
    if (trail.length > 24) trail.shift();
  }, { passive: true });

  document.addEventListener('mouseleave', function () {
    dot.classList.add('elaina-cursor--hidden');
  });

  var SYMS = ['\u2726', '\u2727', '\u22c6', '\u2729'];

  document.addEventListener('click', function (e) {
    for (var i = 0; i < 5; i++) {
      sparks.push({
        x: e.clientX, y: e.clientY,
        vx: (Math.random() - 0.5) * 4.5,
        vy: Math.random() * -3.5 - 0.5,
        a: 1,
        sym: SYMS[Math.floor(Math.random() * SYMS.length)],
        size: Math.random() * 10 + 8
      });
    }
  });

  function frame() {
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < trail.length; i++) {
      var d = trail[i];
      d.a -= 0.038;
      if (d.a <= 0) { trail.splice(i, 1); i--; continue; }
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(196,168,232,' + Math.max(0, d.a).toFixed(2) + ')';
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var j = 0; j < sparks.length; j++) {
      var s = sparks[j];
      s.x += s.vx; s.y += s.vy; s.vy += 0.12;
      s.a -= 0.034;
      if (s.a <= 0) { sparks.splice(j, 1); j--; continue; }
      ctx.font = s.size + 'px serif';
      ctx.fillStyle = 'rgba(212,180,106,' + Math.max(0, s.a).toFixed(2) + ')';
      ctx.fillText(s.sym, s.x, s.y);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}());


/* ══════════════════════════════════════════════════════════
   PARALLAX DEPTH — hero avatar + text moves at different speeds
   Homepage only. Skipped on mobile and reduced-motion.
   ══════════════════════════════════════════════════════════ */

(function elainaFog() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var fog = document.createElement('div');
  fog.id = 'elaina-fog';
  document.body.insertBefore(fog, document.body.firstChild);

  var blobs = [
    { w: '70vw', h: '70vw', top: '-15%', left: '-15%',  bg: 'rgba(139,108,196,1)', anim: 'fog-drift-1 32s ease-in-out infinite' },
    { w: '55vw', h: '55vw', top: '25%',  left: '55%',   bg: 'rgba(100,80,180,1)',  anim: 'fog-drift-2 41s ease-in-out infinite' },
    { w: '65vw', h: '45vw', top: '65%',  left: '-18%',  bg: 'rgba(196,168,232,1)', anim: 'fog-drift-3 38s ease-in-out infinite' },
    { w: '42vw', h: '42vw', top: '-8%',  left: '48%',   bg: 'rgba(60,40,120,1)',   anim: 'fog-drift-4 25s ease-in-out infinite' },
  ];

  blobs.forEach(function (b) {
    var el = document.createElement('div');
    el.className = 'fog-blob';
    el.style.cssText = [
      'width:'  + b.w,
      'height:' + b.h,
      'top:'    + b.top,
      'left:'   + b.left,
      'background:radial-gradient(ellipse at center,' + b.bg + ' 0%,transparent 70%)',
      'animation:' + b.anim,
    ].join(';');
    fog.appendChild(el);
  });
}());

(function elainaParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth < 768) return;

  var avatar  = document.querySelector('.avatar-one');
  var heroTxt = document.querySelector('#home');
  if (!avatar && !heroTxt) return;

  var ticking = false;

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(function () {
        var y = window.pageYOffset;
        if (avatar)  avatar.style.transform  = 'translateY(' + (y * 0.14).toFixed(1) + 'px)';
        if (heroTxt) heroTxt.style.setProperty('--hsy', (y * 0.06).toFixed(1) + 'px');
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}());


/* ══════════════════════════════════════════════════════════
   SECTION MOOD GLOW — scroll-driven hue shift per section
   Lives inside the existing #elaina-fog so it inherits the
   correct z-index and compositor stack — no new fixed overlay
   that could interfere with the star layers.
   ══════════════════════════════════════════════════════════ */

(function sectionMoodGlow() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* Inject a single colour blob into the existing fog layer */
  var fog = document.getElementById('elaina-fog');
  if (!fog) return;

  var blob = document.createElement('div');
  blob.id = 'mood-blob';
  blob.setAttribute('aria-hidden', 'true');
  /* Centred wide ellipse — matching fog-blob conventions but larger */
  blob.style.cssText =
    'position:absolute;width:85%;height:65%;top:18%;left:7.5%;' +
    'border-radius:50%;pointer-events:none;' +
    'filter:blur(88px);opacity:0;' +
    'transition:opacity 1.2s ease;';
  fog.appendChild(blob);

  var moods = {
    'home':                { r: 139, g: 108, b: 196 },
    'about':               { r: 175, g: 138, b:  78 },
    'recent-projects':     { r:  75, g: 135, b: 205 },
    'recent-publications': { r:  55, g: 108, b: 192 },
    'recent-articles':     { r: 115, g:  78, b: 178 },
    'certificates':        { r: 155, g: 118, b:  58 },
    'contact':             { r: 192, g: 138, b:  78 },
  };

  var cur = { r: 139, g: 108, b: 196 };
  var tgt = { r: 139, g: 108, b: 196 };
  var animId = null;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    cur.r = lerp(cur.r, tgt.r, 0.035);
    cur.g = lerp(cur.g, tgt.g, 0.035);
    cur.b = lerp(cur.b, tgt.b, 0.035);
    blob.style.background =
      'rgb(' + Math.round(cur.r) + ',' + Math.round(cur.g) + ',' + Math.round(cur.b) + ')';
    animId = requestAnimationFrame(tick);
  }

  /* Fade the blob in after the intro clears, then start lerp loop */
  setTimeout(function () {
    blob.style.opacity = '0.08';
    animId = requestAnimationFrame(tick);
  }, 600);

  Object.keys(moods).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        tgt.r = moods[id].r;
        tgt.g = moods[id].g;
        tgt.b = moods[id].b;
      }
    }, { threshold: 0.25 }).observe(el);
  });
}());


/* ══════════════════════════════════════════════════════════
   CLIP-PATH CURTAIN REVEAL — cinematic wipe-in on scroll
   Observes parent SECTIONS (never clipped, always layout-
   present) and reveals their children on entry.
   ══════════════════════════════════════════════════════════ */

(function clipReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* Map: section id → child selectors to reveal */
  var sectionMap = [
    { id: 'about',               children: ['h2', '.about-div'] },
    { id: 'recent-projects',     children: ['.recent-header', '.recent-list'] },
    { id: 'recent-publications', children: ['.recent-header', '.recent-list'] },
    { id: 'recent-articles',     children: ['.recent-header', '.recent-list'] },
    { id: 'recent-career',       children: ['.recent-header', '.recent-list'] },
    { id: 'certificates',        children: ['h3', 'p.question', '.main-scroll-div'] },
    { id: 'contact',             children: ['h3', 'p.question', 'a.cv'] },
  ];

  sectionMap.forEach(function (item) {
    var section = document.getElementById(item.id);
    if (!section) return;

    /* Collect and mark the children immediately */
    var els = [];
    item.children.forEach(function (sel) {
      section.querySelectorAll(sel).forEach(function (el) {
        el.classList.add('clip-reveal');
        els.push(el);
      });
    });

    if (!els.length) return;

    /* Watch the SECTION — it is never clipped so the observer fires reliably */
    var triggered = false;
    var obs = new IntersectionObserver(function (entries) {
      if (triggered || !entries[0].isIntersecting) return;
      triggered = true;
      obs.disconnect();
      els.forEach(function (el, i) {
        /* Small per-child stagger so they don't all fire at once */
        setTimeout(function () {
          el.classList.add('clip-reveal--in');
        }, i * 90);
      });
    }, { threshold: 0.08 });

    obs.observe(section);
  });
}());


/* ══════════════════════════════════════════════════════════
   SKILL ICONS STAGGERED ENTRANCE — 60 ms bounce cascade
   ══════════════════════════════════════════════════════════ */

(function skillStagger() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var list = document.querySelector('.skills');
  if (!list) return;

  list.querySelectorAll('li').forEach(function (li, i) {
    li.style.setProperty('--si', String(i));
  });

  new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) {
      list.classList.add('skills--staged');
    }
  }, { threshold: 0.15 }).observe(list);
}());


/* ══════════════════════════════════════════════════════════
   HOMEPAGE SECTION NAV — active ✦ follows scroll position
   ══════════════════════════════════════════════════════════ */

(function homepageSectionNav() {
  if (!document.getElementById('recent-projects')) return;

  var map = [
    { id: 'contact', href: '#contact' },
  ];

  function setActive(href) {
    document.querySelectorAll('.nav-link').forEach(function (l) {
      l.classList.remove('nav-active');
    });
    var link = document.querySelector('.nav-link[href="' + href + '"]');
    if (link) link.classList.add('nav-active');
  }

  map.forEach(function (item) {
    var el = document.getElementById(item.id);
    if (!el) return;
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) setActive(item.href);
    }, { threshold: 0.35 }).observe(el);
  });
}());


/* ══════════════════════════════════════════════════════════
   SCROLL-POSITION DOT INDICATORS — homepage only
   Fixed right-side dots, one per section. Highlights the
   section whose top edge is closest above the viewport mid.
   ══════════════════════════════════════════════════════════ */

(function sectionDots() {
  if (!document.getElementById('home')) return;

  var SECTIONS = [
    { id: 'home',                label: 'Home' },
    { id: 'about',               label: 'About' },
    { id: 'recent-publications', label: 'Publications' },
    { id: 'recent-projects',     label: 'Projects' },
    { id: 'recent-articles',     label: 'Articles' },
    { id: 'recent-career',       label: 'Career' },
    { id: 'certificates',        label: 'Certificates' },
    { id: 'contact',             label: 'Contact' },
  ];

  var nav = document.createElement('nav');
  nav.className = 'section-dots';
  nav.setAttribute('aria-label', 'Jump to section');

  var dotEntries = SECTIONS.map(function (sec) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-dot';
    btn.setAttribute('aria-label', 'Go to ' + sec.label);
    btn.setAttribute('data-section', sec.id);
    btn.innerHTML =
      '<span class="section-dot-pip" aria-hidden="true"></span>' +
      '<span class="section-dot-tooltip" aria-hidden="true">' + sec.label + '</span>';
    btn.addEventListener('click', function () {
      var target = document.getElementById(sec.id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    nav.appendChild(btn);
    return { btn: btn, id: sec.id };
  });

  document.body.appendChild(nav);

  var activeDot = null;

  function updateDots() {
    var midY = window.scrollY + window.innerHeight * 0.45;
    var found = null;
    for (var i = dotEntries.length - 1; i >= 0; i--) {
      var el = document.getElementById(dotEntries[i].id);
      if (!el) continue;
      var top = el.getBoundingClientRect().top + window.scrollY;
      if (top <= midY) { found = dotEntries[i]; break; }
    }
    if (found === activeDot) return;
    dotEntries.forEach(function (d) { d.btn.classList.remove('section-dot--active'); });
    if (found) found.btn.classList.add('section-dot--active');
    activeDot = found;
  }

  window.addEventListener('scroll', updateDots, { passive: true });
  updateDots();
}());
