/* ══════════════════════════════════════════════════════════════
   ÜRÜN STORE — motion.js
   Lightweight motion system (no GSAP / no Lenis):
   · scrollToSection (nav + buttons)
   · IO reveals for .m-fade / .m-up / .m-clip / .reveal
   · Ken Burns + marquee handled in CSS
   · stat counters for [data-count]
   · burger ↔ mobile menu sync (via MutationObserver)
   · header state helper
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var doc = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  doc.classList.add('js');

  /* ── Smooth scroll to section ────────────────────────────────── */
  window.scrollToSection = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (reduceMotion) {
      el.scrollIntoView({ block: 'start' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /* ── IO reveal system ────────────────────────────────────────── */
  var revealSel = '.m-fade, .m-up, .m-clip, .reveal';

  function activateAll() {
    document.querySelectorAll(revealSel).forEach(function (el) {
      el.classList.add('in');
      el.classList.add('active');
    });
  }

  function initReveals() {
    var els = document.querySelectorAll(revealSel);
    if (!els.length) return;
    if (reduceMotion) {
      activateAll();
      return;
    }
    if (!('IntersectionObserver' in window)) {
      activateAll();
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          entry.target.classList.add('active');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Stat counters ───────────────────────────────────────────── */
  function animateCount(el, target, suffix) {
    var dur = 1400;
    var start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(target * eased);
      el.textContent = String(val) + (suffix || '');
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;
    if (reduceMotion) {
      counters.forEach(function (el) {
        var target = parseInt(el.getAttribute('data-count'), 10) || 0;
        var suffix = '';
        var child = el.querySelector('i');
        if (child) suffix = child.textContent;
        el.innerHTML = '';
        el.textContent = String(target) + suffix;
      });
      return;
    }
    if (!('IntersectionObserver' in window)) {
      counters.forEach(function (el) {
        var target = parseInt(el.getAttribute('data-count'), 10) || 0;
        var suffix = '';
        var child = el.querySelector('i');
        if (child) suffix = child.textContent;
        animateCount(el, target, suffix);
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-count'), 10) || 0;
        var suffix = '';
        var child = el.querySelector('i');
        if (child) suffix = child.textContent;
        animateCount(el, target, suffix);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { io.observe(el); });
  }

  /* ── Burger ↔ mobile menu sync ───────────────────────────────── */
  function initBurgerSync() {
    var burger = document.getElementById('navBurger');
    var menu = document.getElementById('navLinks');
    if (!burger || !menu) return;
    function sync() {
      var open = menu.classList.contains('mobile-open');
      burger.classList.toggle('open', open);
    }
    sync();
    var mo = new MutationObserver(sync);
    mo.observe(menu, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── Header scrolled state ───────────────────────────────────── */
  function initHeaderState() {
    var nav = document.getElementById('navbar');
    if (!nav) return;
    function onScroll() {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Chat bot ──────────────────────────────────────────────── */
  var chatBody, chatInput;

  window.toggleChat = function () {
    var wrap = document.getElementById('chatBot');
    var fab = wrap ? wrap.querySelector('.chat__fab') : null;
    if (!wrap) return;
    var open = wrap.classList.toggle('open');
    if (fab) fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var inp = document.getElementById('chatInput');
      if (inp) inp.focus();
    }
  };

  function botReply(userText) {
    var t = (userText || '').toLowerCase();
    var tr = function (x) { return x.toLowerCase(); };
    function has() {
      for (var i = 0; i < arguments.length; i++) {
        if (t.indexOf(tr(arguments[i])) !== -1) return true;
      }
      return false;
    }

    if (has('merhaba', 'selam', 'hey', 'hello', 'hi', 'sa ', 'iyi günler', 'nasılsın', 'naber', 'ne haber')) {
      return 'Merhaba! 👋 Ürün Store hakkında nasıl yardımcı olabilirim? İndirme, güncelleme, hesap, sistem ya da topluluk hakkında sorabilirsiniz.';
    }

    if (has('ücret', 'fiyat', 'paralı', 'free', 'bedava')) {
      return 'Ürün Store istemcisi %100 ücretsizdir. İndirme, güncelleme ve kütüphane özelliklerinin tamamı bedavadır — hiçbir üyelik ücreti yoktur. Platformdaki bazı içerikler oyun geliştiricileri tarafından ücretli olabilir, ama istemcinin kendisi tamamen ücretsizdir.';
    }
    if (has('indir', 'kurulum', 'exe', 'download', 'yükle')) {
      return 'İndirme çok kolay: sağ üstteki veya sayfadaki turuncu "İndir" düğmesine tıklayın. Windows 10/11 için Installer (.exe) dosyası açılır. Kurulumdan sonra hesabınızla giriş yapıp oyunlarınıza erişebilirsiniz. Herhangi bir sorunuz olursa hello@urunstore.com adresinden bize yazabilirsiniz.';
    }
    if (has('güncel', 'update', 'sürüm', 'version')) {
      return 'Evet, güncelleyici tamamen otomatiktir. Oyunlarınız arka planda sessizce güncellenir; bir oyunu başlatmadan önce her zaman en güncel sürüm hazır olur. Manuel güncelleme yapmanıza gerek yoktur.';
    }
    if (has('topluluk', 'discord', 'arkadaş', 'sosyal')) {
      return 'Topluluğumuz Discord üzerinde! Favori oyunlarınızı paylaşabilir, arkadaşlarınızın ne oynadığını görebilir ve oyun gruplarına katılabilirsiniz. Katılmak için: https://discord.gg/ZdYUhX3u3P';
    }
    if (has('sistem', 'windows', 'linux', 'mac', 'işletim', 'os')) {
      return 'Ürün Store şu anda Windows 10 ve Windows 11 destekler. Linux sürümü geliştirme aşamasındadır; macOS planı da ilerleyen dönemlerde değerlendirilecektir.';
    }
    if (has('dil', 'language', 'türkçe', 'ingilizce')) {
      return 'Arayüz 7 dil destekler: Türkçe, İngilizce, Almanca, Fransızca, İspanyolca, Rusça ve Çince. Sağ üstteki dil seçicisinden tek tıkla değiştirebilirsiniz.';
    }
    if (has('hesap', 'kayıt', 'register', 'giriş', 'login', 'şifre', 'parola', 'güven')) {
      return 'Hesabınız Supabase altyapısıyla korunur; şifreler endüstri standardı yöntemlerle şifrelenir. "Kayıt Ol" ile bir dakikadan kısa sürede ücretsiz hesap açabilir, Google ile de giriş yapabilirsiniz. �?ifre sıfırlama bağlantısı e-posta adresinize gönderilir.';
    }
    if (has('kütüphane', 'library', 'oyun', 'oyna', 'app')) {
      return 'Kütüphaneniz tüm oyunlarınızı ve uygulamalarınızı tek bir yerde toplar. İndirdiğiniz her şey tek tıkla erişilebilir ve hesabınızla senkronize kalır.';
    }
    if (has('kvvk', 'veri', 'gizlilik', 'çerez', 'kişisel')) {
      return 'KVKK Aydınlatma Metni ve Kullanım Koşulları\'nı sayfa altındaki bağlantılardan okuyabilirsiniz. Kişisel verileriniz hukuki gereklilikler dışında üçüncü şahıslarla paylaşılmaz ve satılmaz.';
    }
    if (has('iletişim', 'iletişime', 'mail', 'e-posta', 'email', 'ulas')) {
      return 'Bize her zaman ulaşabilirsiniz: hello@urunstore.com — ayrıca Discord topluluğumuz da aktif: https://discord.gg/ZdYUhX3u3P';
    }
    return 'Bu konuda tam emin değilim, özür dilerim. g��� İndirme, güncelleme, hesap, sistem veya topluluk hakkında sorabilirsiniz — ya da hello@urunstore.com adresinden bize yazın, size en kısa sürede dönelim.';
  }

  function askAI(text) {
    var cfg = (typeof window.__URUNSTORE_CFG === 'object' && window.__URUNSTORE_CFG.ai) ? window.__URUNSTORE_CFG.ai : null;
    if (!cfg || !cfg.endpoint || !cfg.key) return Promise.reject('no-ai');
    var body = {
      model: cfg.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: cfg.systemPrompt || 'You are a helpful assistant for Ürün Store, a Windows 10/11 game and app store client. Answer only about Ürün Store topics. Reply in the same language as the user.' },
        { role: 'user', content: text }
      ],
      temperature: 0.4,
      max_tokens: 260
    };
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('ai-http');
      return r.json();
    }).then(function (data) {
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('ai-empty');
      return content.trim();
    });
  }

  function appendMsg(text, who) {
    if (!chatBody) return;
    var m = document.createElement('div');
    m.className = 'msg msg--' + who;
    m.textContent = text;
    chatBody.appendChild(m);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function botRespond(text) {
    appendMsg('…', 'bot');
    var dots = chatBody.lastChild;
    function finish(reply) {
      if (dots && dots.parentNode) dots.parentNode.removeChild(dots);
      appendMsg(reply, 'bot');
    }
    askAI(text).then(finish, function () { finish(botReply(text)); });
  }

  window.sendChat = function (pre) {
    if (!chatInput) chatInput = document.getElementById('chatInput');
    var text = (pre != null ? String(pre) : (chatInput ? chatInput.value : '')).trim();
    if (!text) return;
    appendMsg(text, 'user');
    if (chatInput) chatInput.value = '';
    botRespond(text);
  };

  function initChat() {
    chatBody = document.getElementById('chatBody');
    chatInput = document.getElementById('chatInput');
  }

  /* ── Boot ────────────────────────────────────────────────────── */
  function boot() {
    initReveals();
    initCounters();
    initBurgerSync();
    initHeaderState();
    initChat();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
