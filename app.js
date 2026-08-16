/* ============================================================================
   ÜRÜN STORE — app.js
   Supabase auth, 7 dil, tema, PWA.
   Anon anahtar config.js içinde; service_role asla tarayıcıya koyma.
   Veri koruması Postgres RLS ile sağlanır (sunucu tarafı).
   ============================================================================ */

const _cfg = (typeof window.__URUNSTORE_CFG === 'object' && window.__URUNSTORE_CFG) ? window.__URUNSTORE_CFG : {};
const SUPABASE_URL = String(_cfg.supabaseUrl || '').trim();
const SUPABASE_KEY = String(_cfg.supabaseAnonKey || '').trim();
const DOWNLOAD_URL = String(_cfg.downloadUrl || 'https://github.com/urunstore/urun-store/releases/latest').trim();

let sb = null;
if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
  try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error(e); }
} else {
  console.warn('[UrunStore] Supabase yapılandırması eksik — config.js dosyasını doldurun.');
}

/* ============================================================================
   SPAM / SQLi KORUMASI (ön yüz kosmetiktir; asıl koruma sunucu tarafı + RLS)
   ============================================================================ */

let reqCount = 0;
setInterval(() => { reqCount = Math.max(0, reqCount - 2); }, 2000);

function checkSpamLimit() {
  reqCount++;
  if (reqCount > 8) {
    showToast(getText('spamLimit'), true);
    return false;
  }
  return true;
}

function checkSQLi(str) {
  if (!str) return true;
  const badPatterns = [/(--)/, /(;)/, /(' OR '1'='1)/i, /(\b(select|union|insert|update|delete|drop|alter)\b.*?(from|into|table|database))/i];
  for (let p of badPatterns) if (p.test(str)) return false;
  return true;
}

function isValidUsername(str) {
  if (!str || str.length < 3 || str.length > 30) return false;
  return /^[a-zA-Z0-9_\-]+$/.test(str);
}

/* ============================================================================
   PROXY / VPN TESPİTİ
   ============================================================================ */

const proxyDomains = ['croxyproxy', 'proxysite', 'hide.me', 'kproxy', 'filterbypass', 'unblocksite', 'vpnbook', 'hidemyass', 'webproxy', 'anonymouse', 'proxyfly', 'blockaway', 'unblockit', '4everproxy', 'megaproxy'];

function detectProxy() {
  if (window.self !== window.top) return true;
  const host = window.location.hostname.toLowerCase();
  if (proxyDomains.some(p => host.includes(p))) return true;
  const ref = (document.referrer || '').toLowerCase();
  if (proxyDomains.some(p => ref.includes(p))) return true;
  if (window.location.search.includes('__cpo=') || window.location.search.includes('__cpo%3D')) return true;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // Domain kilidi — kopya/phishing sayfalarını zayıflatır. Canlı önizlemeler için
  // GitHub Pages / Netlify / Vercel adresleri de izin verilir.
  const allowed = [
    'urunstore.com', 'www.urunstore.com', 'urunstore.dev.tc',
    'localhost', '127.0.0.1', 'github.io', 'netlify.app', 'vercel.app', 'pages.dev'
  ];
  if (host && !allowed.some(d => host === d || host.endsWith('.' + d))) return true;
  return false;
}

function blockProxy() {
  document.body.innerHTML = '';
  const div = document.createElement('div');
  div.style.cssText = 'display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:100vh; background:#09090b; color:#fafafa; font-family:sans-serif; text-align:center; gap:16px; padding:24px;';
  const h1 = document.createElement('h1');
  h1.style.cssText = 'font-size:1.6rem; font-weight:700; color:#f87171;';
  h1.textContent = 'Erişim Engellendi';
  const p = document.createElement('p');
  p.style.cssText = 'color:#a1a1aa; font-size:1rem; max-width:480px; line-height:1.6;';
  p.textContent = 'Güvenlik nedeniyle proxy veya VPN üzerinden erişim engellenmektedir. Lütfen doğrudan bağlantı kullanın.';
  div.appendChild(h1); div.appendChild(p);
  document.body.appendChild(div);
  try { if (sb) sb.auth.signOut(); } catch (e) { }
}

if (detectProxy()) {
  window.addEventListener('DOMContentLoaded', blockProxy);
}

/* ============================================================================
   IP BAN + SON IP KAYDI
   ============================================================================ */

let currentUserIP = '';
let ipUpdatedThisSession = false;

async function checkIPBan() {
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    const data = await res.json();
    currentUserIP = data.ip;
    if (!sb) return;
    const { data: bData } = await sb.from('banned_ips').select('ip').eq('ip', currentUserIP).single();
    if (bData && bData.ip) {
      document.body.innerHTML = '';
      const banMsg = document.createElement('div');
      banMsg.style.cssText = 'display:flex; justify-content:center; align-items:center; min-height:100vh; background:#09090b; color:#f87171; font-family:sans-serif; text-align:center; padding:24px;';
      banMsg.textContent = 'Erişim Engellendi (IP Ban)';
      document.body.appendChild(banMsg);
      try { await sb.auth.signOut(); } catch (e) { }
      throw new Error('IP Banned');
    }
    if (!ipUpdatedThisSession) {
      sb.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email) {
          const ipToSave = currentUserIP;
          sb.from('user_profiles').update({ last_ip: ipToSave }).eq('email', session.user.email).then();
          ipUpdatedThisSession = true;
        }
      });
    }
  } catch (e) { /* sessiz geç */ }
}
checkIPBan();

/* ============================================================================
   MODAL / AUTH NAVİGASYONU
   ============================================================================ */

let lastEmail = '';
let lastType = 'signup';

function openModal(t) {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  ['settings', 'otp', 'kvkk'].forEach(m => {
    const el = document.getElementById(m + 'Modal');
    if (el) el.style.display = (t === m) ? 'block' : 'none';
  });
  clearErrors();
}
function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.remove('open');
}
function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function openAuth(type) {
  const langMenu = document.getElementById('langMenu');
  if (langMenu) langMenu.classList.remove('open');
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('navbar').style.display = 'none';
  const auth = document.getElementById('authPage');
  auth.classList.add('show');
  switchAuth(type);
  clearErrors();
}

function closeAuth() {
  const auth = document.getElementById('authPage');
  auth.classList.remove('show');
  document.getElementById('navbar').style.display = 'block';
  if (sb) {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) showDashboard();
      else goHome();
    }).catch(() => goHome());
  } else goHome();
}

function switchAuth(type) {
  const login = document.getElementById('authLoginPanel');
  const register = document.getElementById('authRegisterPanel');
  if (login) login.style.display = type === 'login' ? 'block' : 'none';
  if (register) register.style.display = type === 'register' ? 'block' : 'none';
}

/* ============================================================================
   TEMA
   ============================================================================ */

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

/* ============================================================================
   İNDİRME
   ============================================================================ */

function downloadApp() {
  const url = DOWNLOAD_URL;
  if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
  else showToast(getText('errGeneric'), true);
}

/* ============================================================================
   TOAST
   ============================================================================ */

function showToast(msg, isError, customMs) {
  const t = document.getElementById('toast');
  const m = document.getElementById('toastMsg');
  if (!t || !m) return;
  t.className = 'toast show ' + (isError ? 'error' : '');
  m.textContent = msg;
  const ms = customMs != null ? customMs : (isError ? 6000 : 3200);
  setTimeout(() => t.classList.remove('show'), ms);
}

/* ============================================================================
   HATA FORMATLAMA
   ============================================================================ */

function isRpcFnMissing(err) {
  if (!err) return false;
  const m = String(err.message || '') + String(err.details || '') + String(err.hint || '');
  return /could not find the function|schema cache|function public\.is_username_taken|function public\.profile_email_by_username/i.test(m);
}

function rpcBoolTrue(v) {
  return v === true || v === 'true' || v === 't' || v === 1;
}

function formatSupabaseErr(err) {
  if (!err) return getText('errUnknown');
  const raw = String(err.message || err.error_description || err);
  const m = raw.toLowerCase();
  const tr = currentLang === 'TR';
  if (m.includes('could not find the function') || m.includes('schema cache')) {
    return tr ? 'Veritabanı fonksiyonu henüz yok veya önbellek güncellenmedi. Supabase → SQL Editor\'da `supabase-rpc-auth.sql` çalıştırın; 1–2 dk bekleyip sayfayı yenileyin.' : 'Run `supabase-rpc-auth.sql` in Supabase SQL Editor, wait 1–2 min, refresh.';
  }
  if (raw.includes('Invalid login credentials') || m.includes('invalid login')) return tr ? 'Hatalı e-posta veya şifre.' : 'Wrong email or password.';
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) return tr ? 'Önce e-postanızdaki doğrulama bağlantısına tıklayın.' : 'Confirm your email first.';
  if (m.includes('user already registered') || m.includes('already registered')) return tr ? 'Bu e-posta zaten kayıtlı; giriş yapın.' : 'This email is already registered.';
  if (m.includes('duplicate') || m.includes('unique') || err.code === '23505') return tr ? 'Bu kullanıcı adı veya e-posta zaten kullanımda.' : 'Username or email already in use.';
  if (m.includes('row-level security') || err.code === '42501') return tr ? 'Sunucu güvenlik kuralı bu işlemi reddetti.' : 'This action was blocked by security rules.';
  if (m.includes('jwt expired')) return tr ? 'Oturum süresi doldu; tekrar giriş yapın.' : 'Session expired; please sign in again.';
  if (err.code === 'PGRST116') return tr ? 'Kayıt bulunamadı.' : 'Not found.';
  return raw || getText('errUnknown');
}

function notifyAuthProblem(fieldId, msg) {
  if (fieldId) showError(fieldId, msg);
  showToast(msg, true);
}

/* ============================================================================
   FORM YARDIMCILARI
   ============================================================================ */

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(e => { e.textContent = ''; e.classList.remove('show'); });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

async function insertUserProfileRow(username, email) {
  if (!sb) return;
  const { error } = await sb.from('user_profiles').insert([{ username, email, last_ip: currentUserIP || null }]);
  if (error) {
    notifyAuthProblem('regEmailErr', formatSupabaseErr(error));
    throw error;
  }
}

/* ============================================================================
   KAYIT / GİRİŞ
   ============================================================================ */

async function handleRegister(e) {
  e.preventDefault();
  clearErrors();
  if (!sb) { notifyAuthProblem('regEmailErr', getText('noConn')); return; }
  if (!checkSpamLimit()) return;

  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPassword2').value;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) { notifyAuthProblem('regEmailErr', getText('emailInvalid')); return; }
  if (!isValidUsername(username)) { notifyAuthProblem('regUsernameErr', getText('userInvalid')); return; }
  if (!checkSQLi(username)) { notifyAuthProblem('regUsernameErr', getText('sqlBlocked')); return; }
  if (!checkSQLi(email)) { notifyAuthProblem('regEmailErr', getText('sqlBlocked')); return; }
  if (pass !== pass2) { notifyAuthProblem('regPassword2Err', getText('passMismatch')); return; }

  const btn = document.getElementById('regBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + getText('processing');

  try {
    const unameRpc = await sb.rpc('is_username_taken', { check_username: username });
    if (unameRpc.error && !isRpcFnMissing(unameRpc.error)) {
      notifyAuthProblem('regUsernameErr', formatSupabaseErr(unameRpc.error));
      throw unameRpc.error;
    }
    if (!unameRpc.error && rpcBoolTrue(unameRpc.data)) {
      notifyAuthProblem('regUsernameErr', getText('userTaken'));
      document.getElementById('regUsername').focus();
      return;
    }
    if (unameRpc.error && isRpcFnMissing(unameRpc.error)) {
      showToast(getText('rpcHint'), false, 4500);
    }

    const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { username } } });
    if (error) {
      if (error.status === 429) throw new Error(getText('tooFast'));
      throw error;
    }
    const tr = currentLang === 'TR';

    async function finishSignupSession() {
      closeAuth();
      showToast(tr ? 'Kayıt başarılı, hoş geldin.' : 'Welcome — your account is ready.');
      showDashboard();
      await updateUI();
    }

    if (data.user && data.session) {
      try { await insertUserProfileRow(username, email); }
      catch (_) { showToast(tr ? 'Hesap açıldı; profil satırı eklenemedi (sunucu).' : 'Account created but profile row failed.', true); }
      await finishSignupSession();
    } else if (data.user) {
      if (data.user.identities && data.user.identities.length === 0) {
        const { data: siDup, error: dupErr } = await sb.auth.signInWithPassword({ email, password: pass });
        if (!dupErr && siDup.session) {
          try { await insertUserProfileRow(username, email); } catch (_) { }
          try { await sb.from('user_profiles').update({ username }).eq('email', email); } catch (_) { }
          showToast(tr ? 'Bu e-posta zaten kayıtlıydı; giriş yapıldı.' : 'That email was already registered; signed you in.', false, 4200);
          await finishSignupSession();
        } else {
          notifyAuthProblem('regEmailErr', dupErr && String(dupErr.message || '').includes('Invalid')
            ? (tr ? 'Bu e-posta kayıtlı; şifre yanlış.' : 'Wrong password for this email.')
            : (dupErr ? formatSupabaseErr(dupErr) : (tr ? 'Bu e-posta kayıtlı; giriş yap.' : 'Please sign in.')));
          switchAuth('login');
          const le = document.getElementById('loginEmail'); if (le) le.value = email;
          const lp = document.getElementById('loginPassword'); if (lp) lp.value = '';
          validateLoginForm();
        }
        return;
      }
      const { data: signInData, error: e2 } = await sb.auth.signInWithPassword({ email, password: pass });
      if (!e2 && signInData.session) {
        try { await insertUserProfileRow(username, email); }
        catch (_) { showToast(tr ? 'Giriş yapıldı; profil eklenemedi.' : 'Signed in; profile insert failed.', true); }
        await finishSignupSession();
      } else {
        const needMail = (e2 && String(e2.message || '').toLowerCase().includes('confirm')) || (!e2 && !signInData?.session);
        switchAuth('login');
        const le = document.getElementById('loginEmail'); if (le) le.value = email;
        if (needMail) {
          notifyAuthProblem('regEmailErr', tr ? 'Hesap oluştu. Gelen kutundaki doğrulama linkine tıkla; ardından "Giriş Yap" ile devam et.' : 'Confirm your email, then use Sign in.');
          const lp = document.getElementById('loginPassword'); if (lp) lp.value = pass;
          showToast(tr ? 'Giriş sekmesi açıldı; maili onayladıktan sonra aynı şifreyle giriş yap.' : 'Login tab opened; after email confirm, sign in with the same password.', false, 5500);
        } else {
          notifyAuthProblem('regEmailErr', e2 ? formatSupabaseErr(e2) : tr ? 'Oturum açılamadı; tekrar dene.' : 'Could not sign in.');
        }
        validateLoginForm();
      }
    }
  } catch (err) {
    notifyAuthProblem('regEmailErr', formatSupabaseErr(err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = getText('authReg');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  clearErrors();
  if (!sb) { notifyAuthProblem('loginEmailErr', getText('noConn')); return; }
  if (!checkSpamLimit()) return;

  let email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');

  if (!email || !pass) { notifyAuthProblem('loginEmailErr', getText('fillAll')); return; }
  if (!checkSQLi(email)) { notifyAuthProblem('loginEmailErr', getText('sqlBlocked')); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + getText('processing');

  try {
    if (sb && !email.includes('@')) {
      const { data: resolvedEmail, error: rpcE } = await sb.rpc('profile_email_by_username', { login: email });
      if (rpcE && isRpcFnMissing(rpcE)) {
        notifyAuthProblem('loginEmailErr', getText('usernameLoginHint'));
        return;
      }
      if (rpcE || !resolvedEmail) {
        const msg = rpcE ? formatSupabaseErr(rpcE) : getText('usernameNotFound');
        notifyAuthProblem('loginEmailErr', msg);
        throw new Error(msg);
      }
      email = resolvedEmail;
    }

    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    if (sb && currentUserIP) {
      sb.from('user_profiles').update({ last_ip: currentUserIP }).eq('email', email)
        .then(({ error: upErr }) => { if (upErr) console.warn('last_ip update', upErr); });
    }
    closeAuth();
    showToast(getText('loginOk'));
    showDashboard();
    updateUI();
  } catch (err) {
    notifyAuthProblem('loginPasswordErr', formatSupabaseErr(err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = getText('authLog');
  }
}

async function logout() {
  if (sb) { try { await sb.auth.signOut(); } catch (e) { } }
  showToast(getText('logoutOk'));
  updateUI();
}

/* ============================================================================
   GOOGLE OAUTH
   ============================================================================ */

async function signInWithGoogle() {
  if (!sb) { showToast(getText('noConn'), true); return; }
  if (!checkSpamLimit()) return;
  try {
    const allowedOrigins = ['https://urunstore.com', 'https://www.urunstore.com', window.location.origin];
    const redirectTo = window.location.origin + window.location.pathname;
    if (!allowedOrigins.some(o => redirectTo === o || redirectTo.startsWith(o + '/'))) {
      showToast(getText('redirectErr'), true);
      return;
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) throw error;
  } catch (err) {
    console.error('Google OAuth error:', err);
    showToast(getText('googleErr'), true);
  }
}

/* ============================================================================
   PROFİL / PANEL
   ============================================================================ */

async function updateUI() {
  let user = null;
  if (sb) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        user = {
          username: session.user.user_metadata?.username || session.user.email.split('@')[0],
          email: session.user.email,
          created: new Date(session.user.created_at).toLocaleDateString('tr-TR'),
          id: session.user.id
        };
      }
    } catch (e) { /* sessiz */ }
  }

  if (user) {
    document.getElementById('authButtons').style.display = 'none';
    document.getElementById('navUser').style.display = 'inline-flex';
    document.getElementById('navAvatar').textContent = user.username[0].toUpperCase();
    document.getElementById('navUsername').textContent = user.username;

    document.getElementById('dashAvatar').textContent = user.username[0].toUpperCase();
    document.getElementById('dashUsername').textContent = user.username;
    document.getElementById('dashEmail').textContent = user.email;

    document.getElementById('infoUsername').textContent = user.username;
    document.getElementById('infoEmail').textContent = user.email;
    document.getElementById('infoId').textContent = user.id;
    document.getElementById('infoCreated').textContent = user.created;

    document.getElementById('updateUsername').value = user.username;
    document.getElementById('updateEmail').value = user.email;

    if (!window.initialLayoutSet) {
      window.initialLayoutSet = true;
      showDashboard();
    }
  } else {
    window.initialLayoutSet = true;
    document.getElementById('authButtons').style.display = 'flex';
    document.getElementById('navUser').style.display = 'none';
    goHome();
  }
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const username = document.getElementById('updateUsername').value.trim();
  const email = document.getElementById('updateEmail').value.trim();
  const btn = document.getElementById('btnUpdateProfile');
  btn.disabled = true;

  if (!isValidUsername(username)) {
    showToast(getText('userInvalid'), true);
    btn.disabled = false;
    return;
  }

  if (sb) {
    try {
      const { error } = await sb.auth.updateUser({ email, data: { username } });
      if (error) throw error;
      showToast(getText('profileUpdated'));
      updateUI();
    } catch (err) {
      showToast(getText('errGeneric') + (err.message || ''), true);
    }
  }
  btn.disabled = false;
}

async function handleSendPasswordReset(e) {
  e.preventDefault();
  const currentEmail = document.getElementById('infoEmail').textContent;
  if (!currentEmail || currentEmail === '-') return;
  if (sb) {
    try {
      await sb.auth.resetPasswordForEmail(currentEmail);
      showToast(getText('resetSent'));
    } catch (err) {
      showToast(getText('errGeneric'), true);
    }
  }
}

async function handleForgotPassword() {
  const emailInput = document.getElementById('loginEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    notifyAuthProblem('loginEmailErr', getText('emailInvalid'));
    return;
  }
  if (!sb) { notifyAuthProblem('loginEmailErr', getText('noConn')); return; }
  if (!checkSpamLimit()) return;
  try {
    await sb.auth.resetPasswordForEmail(email);
    showToast(getText('resetSent'));
  } catch (err) {
    showToast(getText('errGeneric') + (err.message || ''), true);
  }
}

async function handleVerifyOTP(e) {
  e.preventDefault();
  const code = document.getElementById('otpCode').value.trim();
  const err = document.getElementById('otpError');
  if (err) err.classList.remove('show');
  if (code.length !== 6) return;
  try {
    const { error } = await sb.auth.verifyOtp({ email: lastEmail, token: code, type: lastType });
    if (error) throw error;
    closeModal();
    showToast(getText('otpOk'));
    showDashboard();
    updateUI();
  } catch (err) {
    showError('otpError', getText('otpBad'));
  }
}

async function resendOTP() {
  if (!lastEmail) return;
  try {
    await sb.auth.resend({ type: lastType, email: lastEmail });
    showToast(getText('otpResent'));
  } catch (e) {
    showToast(getText('errGeneric'), true);
  }
}

/* ============================================================================
   GÖRÜNÜM GEÇİŞLERİ
   ============================================================================ */

function goHome() {
  const main = document.getElementById('mainContent');
  const dash = document.getElementById('dashboard');
  if (!main || !dash) return;
  main.style.display = 'block';
  requestAnimationFrame(() => { main.style.opacity = '1'; });
  dash.style.opacity = '0';
  setTimeout(() => {
    dash.style.display = 'none';
    dash.classList.remove('show');
  }, 250);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboard() {
  const main = document.getElementById('mainContent');
  const dash = document.getElementById('dashboard');
  if (!main || !dash) return;
  main.style.opacity = '0';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    main.style.display = 'none';
    dash.style.display = 'block';
    dash.classList.add('show');
    dash.style.opacity = '0';
    requestAnimationFrame(() => { dash.style.opacity = '1'; });
  }, 250);
}

function toggleMenu() {
  const menu = document.getElementById('navLinks');
  if (menu) menu.classList.toggle('mobile-open');
}

/* ============================================================================
   ŞİFRE GÜCÜ
   ============================================================================ */

function checkPasswordStrength(password) {
  const box = document.getElementById('passwordStrengthBox');
  const label = document.getElementById('strengthLabel');
  const chips = document.getElementById('strengthSuggestions');
  const bars = ['sBar1', 'sBar2', 'sBar3', 'sBar4'].map(id => document.getElementById(id));
  if (!box || !label || !chips) return;

  if (!password || password.length === 0) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);
  const isLong = password.length >= 8;
  const isVeryLong = password.length >= 12;

  let score = 0;
  if (hasLower) score++;
  if (hasUpper) score++;
  if (hasNumber) score++;
  if (hasSpecial) score++;
  if (isLong) score++;
  if (isVeryLong) score++;

  const tr = currentLang === 'TR';
  let level, levelText, barCount;
  if (score <= 2) { level = 1; levelText = tr ? 'Zayıf şifre' : 'Weak password'; barCount = 1; }
  else if (score <= 3) { level = 2; levelText = tr ? 'Orta güçlükte' : 'Medium strength'; barCount = 2; }
  else if (score <= 4) { level = 3; levelText = tr ? 'Güçlü şifre' : 'Strong password'; barCount = 3; }
  else { level = 4; levelText = tr ? 'Çok güçlü' : 'Very strong'; barCount = 4; }

  bars.forEach((bar, i) => {
    if (!bar) return;
    bar.className = 'strength-bar';
    if (i < barCount) bar.classList.add('lv' + level);
  });

  label.className = 'strength-label lv' + level;
  label.textContent = levelText;

  const checks = [
    { met: hasUpper, text: tr ? 'Büyük harf (A-Z)' : 'Uppercase (A-Z)' },
    { met: hasLower, text: tr ? 'Küçük harf (a-z)' : 'Lowercase (a-z)' },
    { met: hasNumber, text: tr ? 'Rakam (0-9)' : 'Number (0-9)' },
    { met: hasSpecial, text: tr ? 'Özel karakter' : 'Special character' },
    { met: isLong, text: tr ? '8+ karakter' : '8+ characters' }
  ];

  chips.textContent = '';
  const unmet = checks.filter(c => !c.met);
  const met = checks.filter(c => c.met);
  [...unmet, ...met].forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'strength-chip' + (c.met ? ' met' : '');
    const icon = document.createElement('i');
    icon.className = 'fas ' + (c.met ? 'fa-check' : 'fa-plus');
    icon.setAttribute('aria-hidden', 'true');
    chip.appendChild(icon);
    chip.appendChild(document.createTextNode(' ' + c.text));
    chips.appendChild(chip);
  });
}

/* ============================================================================
   FORM VALİDASYONU
   ============================================================================ */

function validateLoginForm() {
  const email = document.getElementById('loginEmail')?.value.trim();
  const pass = document.getElementById('loginPassword')?.value;
  const btn = document.getElementById('loginBtn');
  if (!btn) return;
  btn.disabled = !(email && pass);
}

function validateRegisterForm() {
  const username = document.getElementById('regUsername')?.value.trim();
  const email = document.getElementById('regEmail')?.value.trim();
  const pass = document.getElementById('regPassword')?.value;
  const pass2 = document.getElementById('regPassword2')?.value;
  const kvkk = document.getElementById('kvkkCheck')?.checked;
  const btn = document.getElementById('regBtn');
  if (!btn) return;
  btn.disabled = !(username && username.length >= 3 && email && pass && pass.length >= 6 && pass2 && kvkk);
}

/* ============================================================================
   ÇEVİRİLER (7 DİL)
   ============================================================================ */

const translations = {
  TR: {
    navHome: 'Ana Sayfa', navFeatures: 'Özellikler', navFaq: 'SSS', navCommunity: 'Topluluk',
    navLogin: 'Giriş', navRegister: 'Kayıt Ol',
    heroTitle: 'Oyun ve uygulamaların <span class="accent-word">yepyeni evi.</span>',
    heroSub: 'Favori oyunlarınızı tek bir pratik arayüzde toplayın. İndirin, her zaman güncel kalın, toplulukla bağı koparmayın.',
    winTitle: 'Windows için İndir', winDesc: 'Windows 10 / 11 uyumlu • Kurulum dosyası (.exe)',
    caseNoteL: 'Kurulum', caseNote1: 'Kurulum dosyasını indirin, çalıştırın ve talimatları izleyin.', caseNote2: 'Tüm güncellemeler istemci üzerinden otomatik gelir.',
    dlBtn: 'İndir', dlNote: 'GitHub Releases üzerinden güvenli dağıtım',
    featuresTitle: 'Bir mağaza istemcisinden fazlası',
    featuresSub: 'İndirme, güncelleme ve sosyal deneyim — tek uygulamada birleşmiş.',
    f1Title: 'Hızlı İndirme', f1Desc: 'Optimize edilmiş dağıtım ile oyunlarınızı kütüphanenize saniyeler içinde ekleyin.',
    f2Title: 'Otomatik Güncelleme', f2Desc: 'Arka planda çalışan güncelleyici, siz oyuna girmeden tüm dosyalarınızı hazır tutar.',
    f3Title: 'Sosyal Hub', f3Desc: 'Arkadaşlarınızın ne oynadığını görün ve Discord entegrasyonuyla gruplara katılın.',
    faqTitle: 'Sıkça sorulan sorular',
    faqSub: 'Aklınıza takılanları yanıtladık.',
    faq1_q: 'Uygulama tamamen ücretsiz mi?',
    faq1_a: 'Evet, istemciyi indirmek ve kullanmak tamamen ücretsizdir. Platform içindeki bazı oyunlar veya içerikler ücretli olabilir.',
    faq2_q: 'Hangi işletim sistemlerini destekliyor?',
    faq2_a: 'Şu anda Windows 10/11 desteği aktif. Linux sürümü geliştirme aşamasındadır.',
    faq3_q: 'Hesap bilgilerim güvende mi?',
    faq3_a: 'Şifreleriniz ve kişisel verileriniz Supabase altyapısıyla korunur ve endüstri standardı protokollerle işlenir.',
    faq4_q: 'Oyunlarım otomatik güncellenir mi?',
    faq4_a: 'Evet. Arka plandaki güncelleyici, başlatmadan önce kütüphanenizdeki oyunları en güncel sürüme getirir.',
    ctaTitle: 'Kütüphanenizi bugün kurmaya başlayın',
    ctaSub: 'Ücretsiz istemciyi indirin, hesabınızı oluşturun ve oyunlarınızı tek yerden yönetin.',
    ctaBtn: 'Windows için İndir',
    footerRights: 'Tüm hakları saklıdır.',
    footerTerms: 'Kullanım Koşulları', footerPrivacy: 'KVKK Aydınlatma Metni',
    authBack: 'Geri Dön',
    authVisualTitle: 'Oyunlarınız için tek bir ev.',
    authVisualSub: 'Ücretsiz hesap açın, kütüphanenizi yönetin ve topluluğa katılın.',
    authPerk1: 'Ücretsiz kayıt, bir dakikadan kısa sürer',
    authPerk2: 'Kütüphane ve indirmeleriniz tüm cihazlarınızda senkron',
    authPerk3: 'Supabase altyapısıyla güvenli oturum',
    authW: 'Tekrar hoş geldin', authWD: 'Lütfen bilgilerinizi girin.',
    authJoin: 'Aramıza katıl', authJoinD: 'Platforma erişmek için ücretsiz kayıt olun.',
    authPass: 'Şifre', authPass2: 'Şifre tekrar', authPass2P: 'Şifrenizi doğrulayın',
    authFor: 'Şifremi unuttum', authLog: 'Giriş Yap', authReg: 'Hesap Oluştur',
    authNoAcc: 'Hesabın yok mu? ', authHasAcc: 'Hesabın var mı? ',
    authGoogle: 'Google ile devam et', authOr: 'veya',
    loginUserEmail: 'E-posta veya kullanıcı adı',
    authRem: 'Oturumumu hatırla',
    authTerms: 'Kullanım Koşulları ve KVKK Aydınlatma Metni\'ni', authTerms2: ' okudum, anladım ve kabul ediyorum.',
    dashWelcome: 'Hoş geldin', dashUser: 'Kullanıcı Adı', dashEmail: 'E-posta',
    dashId: 'Hesap ID', dashDate: 'Kayıt Tarihi', dashStat: 'Durum', dashAct: 'Onaylı',
    dashOut: 'Çıkış Yap', dashDlBtn: 'Programı İndir', dashSet: 'Ayarlar', dashSum: 'Hesap Özeti',
    spamLimit: 'Sistem koruması: Çok hızlı işlem yapıyorsunuz. Lütfen bekleyin.',
    noConn: 'Bağlantı kurulamadı. Sayfayı yenileyin.',
    fillAll: 'Lütfen tüm alanları doldurun.',
    emailInvalid: 'Geçerli bir e-posta adresi girin.',
    userInvalid: 'Kullanıcı adı 3-30 karakter olmalı ve yalnızca harf, rakam, _ veya - içermelidir.',
    sqlBlocked: 'Sistem koruması: engellenen bir ifade kullandınız.',
    passMismatch: 'Şifreler eşleşmiyor.',
    processing: 'İşleniyor…',
    userTaken: 'Bu kullanıcı adı başka bir hesapta kayıtlı. Farklı bir ad seçin.',
    rpcHint: 'İpucu: supabase-rpc-auth.sql dosyasını Supabase\'te çalıştırırsanız kullanıcı adı kontrolü de aktif olur.',
    tooFast: 'Çok fazla istek; bir süre sonra tekrar deneyin.',
    usernameLoginHint: 'Kullanıcı adı ile giriş için Supabase\'te `supabase-rpc-auth.sql` çalıştırılmalı. Şimdilik tam e-posta adresinizle giriş yapın.',
    usernameNotFound: 'Bu kullanıcı adı sistemde bulunamadı.',
    loginOk: 'Giriş başarılı.',
    logoutOk: 'Çıkış yapıldı.',
    redirectErr: 'Güvenlik hatası: yönlendirme adresi geçersiz.',
    googleErr: 'Google girişi sırasında bir hata oluştu.',
    profileUpdated: 'Profil güncellendi.',
    errGeneric: 'Hata: ',
    errUnknown: 'Bilinmeyen bir hata oluştu.',
    resetSent: 'Bağlantı gönderildi.',
    otpOk: 'E-posta doğrulandı.',
    otpBad: 'Geçersiz veya süresi dolmuş kod.',
    otpResent: 'Yeni kod gönderildi.'
  },

  EN: {
    navHome: 'Home', navFeatures: 'Features', navFaq: 'FAQ', navCommunity: 'Community',
    navLogin: 'Login', navRegister: 'Sign Up',
    heroTitle: 'A brand new home<br>for your games <span class="accent-word">& apps.</span>',
    heroSub: 'Bring your favorite games together in one practical interface. Download, stay updated, and never lose touch with the community.',
    winTitle: 'Download for Windows', winDesc: 'Windows 10 / 11 compatible • Installer (.exe)',
    caseNoteL: 'Installation', caseNote1: 'Download the installer, run it and follow the instructions.', caseNote2: 'All updates come automatically through the client.',
    dlBtn: 'Download', dlNote: 'Secure delivery via GitHub Releases',
    featuresTitle: 'More than just a store client',
    featuresSub: 'Downloads, updates, and social — combined in a single app.',
    f1Title: 'Fast Downloads', f1Desc: 'Add games to your library in seconds with an optimized delivery network.',
    f2Title: 'Automatic Updates', f2Desc: 'A background updater keeps every file ready before you even launch a game.',
    f3Title: 'Social Hub', f3Desc: 'See what your friends are playing and join groups with Discord integration.',
    faqTitle: 'Frequently asked questions',
    faqSub: 'Everything you need to know.',
    faq1_q: 'Is the app completely free?',
    faq1_a: 'Yes, downloading and using the client is completely free. Some games or content inside the platform may be paid.',
    faq2_q: 'Which operating systems are supported?',
    faq2_a: 'Windows 10/11 is supported today. A Linux build is in development.',
    faq3_q: 'Are my account details safe?',
    faq3_a: 'Passwords and personal data are handled on Supabase infrastructure with industry-standard protocols.',
    faq4_q: 'Do my games update automatically?',
    faq4_a: 'Yes. The background updater brings your library to the latest version before you launch a game.',
    ctaTitle: 'Set up your library today',
    ctaSub: 'Download the free client, create your account, and manage your games in one place.',
    ctaBtn: 'Download for Windows',
    footerRights: 'All rights reserved.',
    footerTerms: 'Terms of Service', footerPrivacy: 'Privacy Policy',
    authBack: 'Go Back',
    authVisualTitle: 'One home for your games.',
    authVisualSub: 'Create a free account, manage your library, and join the community.',
    authPerk1: 'Free sign-up in under a minute',
    authPerk2: 'Library and downloads synced across devices',
    authPerk3: 'Secure sessions on Supabase infrastructure',
    authW: 'Welcome back', authWD: 'Please enter your details.',
    authJoin: 'Join us', authJoinD: 'Sign up for free to access the platform.',
    authPass: 'Password', authPass2: 'Repeat password', authPass2P: 'Verify your password',
    authFor: 'Forgot password', authLog: 'Login', authReg: 'Create Account',
    authNoAcc: 'No account? ', authHasAcc: 'Already have an account? ',
    authGoogle: 'Continue with Google', authOr: 'or',
    loginUserEmail: 'Email or username',
    authRem: 'Keep me signed in',
    authTerms: 'Terms of Service and Privacy Policy', authTerms2: ' I have read and agree.',
    dashWelcome: 'Welcome', dashUser: 'Username', dashEmail: 'Email',
    dashId: 'Account ID', dashDate: 'Registered', dashStat: 'Status', dashAct: 'Verified',
    dashOut: 'Log Out', dashDlBtn: 'Download App', dashSet: 'Settings', dashSum: 'Account Summary',
    spamLimit: 'Rate limit: please slow down and try again.',
    noConn: 'Cannot connect. Please refresh the page.',
    fillAll: 'Please fill in all fields.',
    emailInvalid: 'Please enter a valid email address.',
    userInvalid: 'Username must be 3-30 characters using only letters, numbers, _ or -.',
    sqlBlocked: 'Security: blocked phrase detected.',
    passMismatch: 'Passwords do not match.',
    processing: 'Processing…',
    userTaken: 'This username is already in use. Please pick another.',
    rpcHint: 'Tip: run supabase-rpc-auth.sql in Supabase to enable username checks.',
    tooFast: 'Too many requests. Wait a moment and try again.',
    usernameLoginHint: 'Run supabase-rpc-auth.sql to enable username login. Use your full email for now.',
    usernameNotFound: 'This username was not found.',
    loginOk: 'Signed in.',
    logoutOk: 'Signed out.',
    redirectErr: 'Security error: invalid redirect address.',
    googleErr: 'Something went wrong during Google sign-in.',
    profileUpdated: 'Profile updated.',
    errGeneric: 'Error: ',
    errUnknown: 'Something went wrong.',
    resetSent: 'Reset link sent.',
    otpOk: 'Email verified.',
    otpBad: 'Invalid or expired code.',
    otpResent: 'A new code was sent.'
  },

  DE: {
    navHome: 'Startseite', navFeatures: 'Funktionen', navFaq: 'FAQ', navCommunity: 'Gemeinschaft',
    navLogin: 'Anmelden', navRegister: 'Registrieren',
    heroTitle: 'Ein neues Zuhause<br>für deine Spiele <span class="accent-word">& Apps.</span>',
    heroSub: 'Bündle deine Lieblingsspiele in einer praktischen Oberfläche. Lade herunter, bleib aktuell und verliere nie den Kontakt zur Community.',
    winTitle: 'Download für Windows', winDesc: 'Windows 10 / 11 kompatibel • Installationsdatei (.exe)',
    caseNoteL: 'Installation', caseNote1: 'Laden Sie die Installationsdatei herunter, führen Sie sie aus und folgen Sie den Anweisungen.', caseNote2: 'Alle Updates kommen automatisch über den Client.',
    dlBtn: 'Herunterladen', dlNote: 'Sichere Bereitstellung über GitHub Releases',
    featuresTitle: 'Mehr als ein Store-Client',
    featuresSub: 'Downloads, Updates und Soziales — in einer App vereint.',
    f1Title: 'Schnelle Downloads', f1Desc: 'Füge Spiele in Sekunden zur Bibliothek hinzu — dank optimiertem Netzwerk.',
    f2Title: 'Automatische Updates', f2Desc: 'Ein Hintergrund-Updater hält alle Dateien bereit, bevor du startest.',
    f3Title: 'Sozialer Hub', f3Desc: 'Sieh, was Freunde spielen, und tritt mit Discord-Integration Gruppen bei.',
    faqTitle: 'Häufige Fragen',
    faqSub: 'Alles, was Sie wissen müssen.',
    faq1_q: 'Ist die App völlig kostenlos?',
    faq1_a: 'Ja, der Download und die Nutzung sind kostenlos. Einige Spiele oder Inhalte können kostenpflichtig sein.',
    faq2_q: 'Welche Systeme werden unterstützt?',
    faq2_a: 'Windows 10/11 wird unterstützt. Eine Linux-Version ist in Entwicklung.',
    faq3_q: 'Sind meine Daten sicher?',
    faq3_a: 'Passwörter und Daten werden auf Supabase-Infrastruktur nach Industriestandard verarbeitet.',
    ctaTitle: 'Richte deine Bibliothek heute ein',
    ctaSub: 'Lade den kostenlosen Client herunter und verwalte deine Spiele an einem Ort.',
    ctaBtn: 'Für Windows herunterladen',
    footerRights: 'Alle Rechte vorbehalten.',
    footerTerms: 'Nutzungsbedingungen', footerPrivacy: 'Datenschutz',
    authBack: 'Zurück', authW: 'Willkommen zurück', authJoin: 'Mach mit',
    authPass: 'Passwort', authPass2: 'Passwort wiederholen', authPass2P: 'Passwort bestätigen',
    authFor: 'Passwort vergessen', authLog: 'Anmelden', authReg: 'Konto erstellen',
    authGoogle: 'Mit Google fortfahren', authOr: 'oder', loginUserEmail: 'E-Mail oder Benutzername',
    dashWelcome: 'Willkommen', dashUser: 'Benutzername', dashEmail: 'E-Mail',
    dashId: 'Konto-ID', dashDate: 'Registriert', dashStat: 'Status', dashAct: 'Verifiziert',
    dashOut: 'Abmelden', dashDlBtn: 'App herunterladen', dashSet: 'Einstellungen', dashSum: 'Kontoübersicht'
  },

  FR: {
    navHome: 'Accueil', navFeatures: 'Fonctionnalités', navFaq: 'FAQ', navCommunity: 'Communauté',
    navLogin: 'Connexion', navRegister: "S'inscrire",
    heroTitle: 'Une nouvelle maison<br>pour vos jeux <span class="accent-word">& applis.</span>',
    heroSub: 'Rassemblez vos jeux préférés dans une interface pratique. Téléchargez, restez à jour, gardez le lien avec la communauté.',
    winTitle: 'Télécharger pour Windows', winDesc: 'Windows 10 / 11 compatible • Fichier (.exe)',
    caseNoteL: 'Installation', caseNote1: 'Téléchargez le fichier d\'installation, exécutez-le et suivez les instructions.', caseNote2: 'Toutes les mises à jour arrivent automatiquement via le client.',
    dlBtn: 'Télécharger', dlNote: 'Distribution sécurisée via GitHub Releases',
    featuresTitle: 'Plus qu\'un client de magasin',
    featuresSub: 'Téléchargements, mises à jour et social — dans une seule app.',
    f1Title: 'Téléchargements rapides', f1Desc: 'Ajoutez des jeux en quelques secondes grâce à un réseau optimisé.',
    f2Title: 'Mises à jour automatiques', f2Desc: 'Un outil en arrière-plan prépare tous vos fichiers avant de lancer.',
    f3Title: 'Hub social', f3Desc: 'Voyez ce que jouent vos amis et rejoignez des groupes via Discord.',
    faqTitle: 'Questions fréquentes',
    faqSub: 'Tout ce que vous devez savoir.',
    faq1_q: 'L\'application est-elle gratuite ?',
    faq1_a: 'Oui, le téléchargement et l\'utilisation sont gratuits. Certains jeux ou contenus peuvent être payants.',
    faq2_q: 'Quels systèmes sont pris en charge ?',
    faq2_a: 'Windows 10/11 est pris en charge. Une version Linux est en développement.',
    faq3_q: 'Mes données sont-elles en sécurité ?',
    faq3_a: 'Les mots de passe et les données sont traités sur l\'infrastructure Supabase selon les normes industrielles.',
    ctaTitle: 'Configurez votre bibliothèque aujourd\'hui',
    ctaSub: 'Téléchargez le client gratuit et gérez vos jeux au même endroit.',
    ctaBtn: 'Télécharger pour Windows',
    footerRights: 'Tous droits réservés.',
    footerTerms: 'Conditions', footerPrivacy: 'Confidentialité',
    authBack: 'Retour', authW: 'Bon retour', authJoin: 'Rejoignez-nous',
    authPass: 'Mot de passe', authPass2: 'Répéter le mot de passe', authPass2P: 'Confirmez le mot de passe',
    authFor: 'Mot de passe oublié', authLog: 'Connexion', authReg: 'Créer un compte',
    authGoogle: 'Continuer avec Google', authOr: 'ou', loginUserEmail: 'E-mail ou nom d\'utilisateur',
    dashWelcome: 'Bienvenue', dashUser: 'Nom d\'utilisateur', dashEmail: 'E-mail',
    dashId: 'ID du compte', dashDate: 'Inscrit', dashStat: 'Statut', dashAct: 'Vérifié',
    dashOut: 'Se déconnecter', dashDlBtn: 'Télécharger l\'app', dashSet: 'Paramètres', dashSum: 'Résumé du compte'
  },

  ES: {
    navHome: 'Inicio', navFeatures: 'Características', navFaq: 'Preguntas', navCommunity: 'Comunidad',
    navLogin: 'Iniciar sesión', navRegister: 'Registrarse',
    heroTitle: 'Un nuevo hogar<br>para tus juegos <span class="accent-word">y apps.</span>',
    heroSub: 'Reúne tus juegos favoritos en una interfaz práctica. Descarga, mantente al día y no pierdas el contacto con la comunidad.',
    winTitle: 'Descargar para Windows', winDesc: 'Compatible con Windows 10 / 11 • Archivo (.exe)',
    caseNoteL: 'Instalación', caseNote1: 'Descarga el archivo de instalación, ejecútalo y sigue las instrucciones.', caseNote2: 'Todas las actualizaciones llegan automáticamente a través del cliente.',
    dlBtn: 'Descargar', dlNote: 'Distribución segura vía GitHub Releases',
    featuresTitle: 'Más que un cliente de tienda',
    featuresSub: 'Descargas, actualizaciones y social — en una sola app.',
    f1Title: 'Descargas rápidas', f1Desc: 'Añade juegos en segundos gracias a una red optimizada.',
    f2Title: 'Actualizaciones automáticas', f2Desc: 'Un actualizador en segundo plano deja todos tus archivos listos antes de iniciar.',
    f3Title: 'Hub social', f3Desc: 'Mira qué juegan tus amigos y únete a grupos con la integración de Discord.',
    faqTitle: 'Preguntas frecuentes',
    faqSub: 'Todo lo que necesitas saber.',
    faq1_q: '¿La aplicación es totalmente gratis?',
    faq1_a: 'Sí, descargar y usar el cliente es gratis. Algunos juegos o contenidos pueden ser de pago.',
    faq2_q: '¿Qué sistemas operativos se admiten?',
    faq2_a: 'Se admiten Windows 10/11. Una versión para Linux está en desarrollo.',
    faq3_q: '¿Mis datos están seguros?',
    faq3_a: 'Las contraseñas y los datos se procesan en la infraestructura de Supabase con estándares industriales.',
    ctaTitle: 'Configura tu biblioteca hoy',
    ctaSub: 'Descarga el cliente gratis y gestiona tus juegos en un solo lugar.',
    ctaBtn: 'Descargar para Windows',
    footerRights: 'Todos los derechos reservados.',
    footerTerms: 'Términos', footerPrivacy: 'Privacidad',
    authBack: 'Volver', authW: 'Bienvenido de nuevo', authJoin: 'Únete',
    authPass: 'Contraseña', authPass2: 'Repetir contraseña', authPass2P: 'Confirma tu contraseña',
    authFor: 'Olvidé mi contraseña', authLog: 'Iniciar sesión', authReg: 'Crear cuenta',
    authGoogle: 'Continuar con Google', authOr: 'o', loginUserEmail: 'Correo o nombre de usuario',
    dashWelcome: 'Bienvenido', dashUser: 'Nombre de usuario', dashEmail: 'Correo',
    dashId: 'ID de cuenta', dashDate: 'Registrado', dashStat: 'Estado', dashAct: 'Verificado',
    dashOut: 'Cerrar sesión', dashDlBtn: 'Descargar app', dashSet: 'Ajustes', dashSum: 'Resumen de la cuenta'
  },

  RU: {
    navHome: 'Главная', navFeatures: 'Функции', navFaq: 'Вопросы', navCommunity: 'Сообщество',
    navLogin: 'Войти', navRegister: 'Регистрация',
    heroTitle: 'Новый дом<br>для ваших игр <span class="accent-word">и приложений.</span>',
    heroSub: 'Соберите любимые игры в одном удобном интерфейсе. Скачивайте, оставайтесь в курсе и не теряйте связь с сообществом.',
    winTitle: 'Скачать для Windows', winDesc: 'Windows 10 / 11 совместим • Установщик (.exe)',
    caseNoteL: 'Установка', caseNote1: 'Скачайте файл установки, запустите его и следуйте инструкциям.', caseNote2: 'Все обновления приходят автоматически через клиент.',
    dlBtn: 'Скачать', dlNote: 'Безопасная доставка через GitHub Releases',
    featuresTitle: 'Больше, чем клиент магазина',
    featuresSub: 'Загрузки, обновления и социальное — в одном приложении.',
    f1Title: 'Быстрые загрузки', f1Desc: 'Добавляйте игры за секунды благодаря оптимизированной сети.',
    f2Title: 'Автообновления', f2Desc: 'Фоновый апдейтер держит все файлы готовыми до запуска игры.',
    f3Title: 'Социальный хаб', f3Desc: 'Смотрите, во что играют друзья, и вступайте в группы через Discord.',
    faqTitle: 'Частые вопросы',
    faqSub: 'Всё, что вам нужно знать.',
    faq1_q: 'Приложение полностью бесплатно?',
    faq1_a: 'Да, скачивание и использование бесплатны. Некоторые игры или контент могут быть платными.',
    faq2_q: 'Какие системы поддерживаются?',
    faq2_a: 'Поддерживаются Windows 10/11. Версия для Linux в разработке.',
    faq3_q: 'Мои данные в безопасности?',
    faq3_a: 'Пароли и данные обрабатываются на инфраструктуре Supabase по отраслевым стандартам.',
    ctaTitle: 'Настройте библиотеку сегодня',
    ctaSub: 'Скачайте бесплатный клиент и управляйте играми в одном месте.',
    ctaBtn: 'Скачать для Windows',
    footerRights: 'Все права защищены.',
    footerTerms: 'Условия', footerPrivacy: 'Конфиденциальность',
    authBack: 'Назад', authW: 'С возвращением', authJoin: 'Присоединяйтесь',
    authPass: 'Пароль', authPass2: 'Повторите пароль', authPass2P: 'Подтвердите пароль',
    authFor: 'Забыли пароль', authLog: 'Войти', authReg: 'Создать аккаунт',
    authGoogle: 'Продолжить с Google', authOr: 'или', loginUserEmail: 'Почта или имя пользователя',
    dashWelcome: 'Добро пожаловать', dashUser: 'Имя пользователя', dashEmail: 'Почта',
    dashId: 'ID аккаунта', dashDate: 'Регистрация', dashStat: 'Статус', dashAct: 'Проверено',
    dashOut: 'Выйти', dashDlBtn: 'Скачать приложение', dashSet: 'Настройки', dashSum: 'Сводка аккаунта'
  },

  ZH: {
    navHome: '首页', navFeatures: '功能', navFaq: '常见问题', navCommunity: '社区',
    navLogin: '登录', navRegister: '注册',
    heroTitle: '游戏和应用<br>的全新家园',
    heroSub: '在一个实用界面中汇集你喜爱的游戏。下载、保持最新，并始终与社区保持联系。',
    winTitle: '下载 Windows 版', winDesc: '兼容 Windows 10 / 11 • 安装程序 (.exe)',
    caseNoteL: '安装', caseNote1: '下载安装文件，运行并按照说明操作。', caseNote2: '所有更新都会通过客户端自动获取。',
    dlBtn: '下载', dlNote: '通过 GitHub Releases 安全分发',
    featuresTitle: '不止是一个商店客户端',
    featuresSub: '下载、更新与社交 —— 集于一个应用。',
    f1Title: '快速下载', f1Desc: '借助优化网络，几秒内将游戏加入你的库。',
    f2Title: '自动更新', f2Desc: '后台更新器在你启动游戏前让所有文件就绪。',
    f3Title: '社交中心', f3Desc: '查看朋友在玩什么，并通过 Discord 集成加入群组。',
    faqTitle: '常见问题',
    faqSub: '您需要知道的一切。',
    faq1_q: '这个应用完全免费吗？',
    faq1_a: '是的，下载和使用客户端完全免费。平台内部分游戏或内容可能收费。',
    faq2_q: '支持哪些操作系统？',
    faq2_a: '目前支持 Windows 10/11。Linux 版本正在开发中。',
    faq3_q: '我的账户信息安全吗？',
    faq3_a: '密码和个人数据在 Supabase 基础设施上按行业标准处理。',
    ctaTitle: '今天就建立你的游戏库',
    ctaSub: '下载免费客户端，在一个地方管理你的游戏。',
    ctaBtn: '下载 Windows 版',
    footerRights: '版权所有。',
    footerTerms: '服务条款', footerPrivacy: '隐私政策',
    authBack: '返回', authW: '欢迎回来', authJoin: '加入我们',
    authPass: '密码', authPass2: '重复密码', authPass2P: '确认密码',
    authFor: '忘记密码', authLog: '登录', authReg: '创建账户',
    authGoogle: '使用 Google 继续', authOr: '或', loginUserEmail: '邮箱或用户名',
    dashWelcome: '欢迎', dashUser: '用户名', dashEmail: '邮箱',
    dashId: '账户 ID', dashDate: '注册日期', dashStat: '状态', dashAct: '已验证',
    dashOut: '退出登录', dashDlBtn: '下载应用', dashSet: '设置', dashSum: '账户概览'
  }
};

/* ============================================================================
   STUDIO TASARIM EK ÇEVİRİLERİ (7 dil) — Object.assign ile birleştirilir
   ============================================================================ */

const studioExtra = {
  TR: {
    heroL1: 'Oyun ve', heroL2: 'uygulamaların', heroL3: 'yepyeni evi.',
    heroTag: 'Windows 10/11 · Ücretsiz İstemci',
    heroIntro: 'Favori oyunlarınızı tek bir pratik arayüzde toplayın. <strong>İndirin, güncel kalın, bağı koparmayın.</strong>',
    heroScroll: 'Kaydır',
    marqW1: 'Oyun', marqW2: 'Uygulama', marqW3: 'Topluluk', marqW4: '7 Dil', marqW5: '%100 Ücretsiz', marqW6: 'Windows 10/11',
    st1: 'Oyunlarınız için', st2: 'tek bir yeni ev.', st3: 'İndirin, güncel kalın, bağı koparmayın.',
    aboutL: 'Hakkında',
    aboutReel: 'Ürün Store ile tanışın',
    amL1: 'Platform', amL2: 'Sistem', amL3: 'Dil', amL4: 'Fiyat',
    amV4: '%100 Ücretsiz',
    dlL: 'İndir',
    workL: 'Platform',
    w1t: 'Kütüphane', w1s: 'Oyunlarınız tek yerden',
    w2t: 'Mağaza', w2s: 'Hızlı ve güvenli indirme',
    w3t: 'Güncelleyici', w3s: 'Arka planda otomatik',
    w4t: 'Topluluk', w4s: 'Discord ile sosyal hub',
    sL1: 'Dil desteği', sL2: 'Ücretsiz', sL3: '7/24 Erişim', sL4: 'Tek uygulama',
    ctaLbl: 'Birlikte başlayalım',
    ctaL1: 'Kütüphanenizi', ctaL2: 'bugün kurun.'
  },

  EN: {
    heroL1: 'A brand new', heroL2: 'home for your', heroL3: 'games & apps.',
    heroTag: 'Windows 10/11 · Free Client',
    heroIntro: 'Bring your favorite games together in one practical interface. <strong>Download, stay updated, never lose touch.</strong>',
    heroScroll: 'Scroll',
    marqW1: 'Games', marqW2: 'Apps', marqW3: 'Community', marqW4: '7 Languages', marqW5: '100% Free', marqW6: 'Windows 10/11',
    st1: 'One new home', st2: 'for all your games.', st3: 'Download, stay updated, never lose touch.',
    aboutL: 'About',
    aboutReel: 'Meet Ürün Store',
    amL1: 'Platform', amL2: 'System', amL3: 'Language', amL4: 'Price',
    amV4: '100% Free',
    dlL: 'Download',
    workL: 'Platform',
    w1t: 'Library', w1s: 'Your games in one place',
    w2t: 'Store', w2s: 'Fast, secure downloads',
    w3t: 'Updater', w3s: 'Automatic in the background',
    w4t: 'Community', w4s: 'Social hub with Discord',
    sL1: 'Languages', sL2: 'Free forever', sL3: '24/7 Access', sL4: 'One app',
    ctaLbl: "Let's start together",
    ctaL1: 'Set up your', ctaL2: 'library today.'
  },

  DE: {
    heroL1: 'Ein neues', heroL2: 'Zuhause für', heroL3: 'Spiele & Apps.',
    heroTag: 'Windows 10/11 · Kostenloser Client',
    heroIntro: 'Bündle deine Lieblingsspiele in einer praktischen Oberfläche. <strong>Lade herunter, bleib aktuell, verlier nie den Kontakt.</strong>',
    heroScroll: 'Scrollen',
    marqW1: 'Spiele', marqW2: 'Apps', marqW3: 'Community', marqW4: '7 Sprachen', marqW5: '100% Kostenlos', marqW6: 'Windows 10/11',
    st1: 'Ein neues Zuhause', st2: 'für all deine Spiele.', st3: 'Lade herunter, bleib aktuell, verlier nie den Kontakt.',
    aboutL: 'Über uns',
    aboutReel: 'Triff Ürün Store',
    amL1: 'Plattform', amL2: 'System', amL3: 'Sprache', amL4: 'Preis',
    amV4: '100% Kostenlos',
    dlL: 'Download',
    workL: 'Plattform',
    w1t: 'Bibliothek', w1s: 'Deine Spiele an einem Ort',
    w2t: 'Store', w2s: 'Schnelle, sichere Downloads',
    w3t: 'Updater', w3s: 'Automatisch im Hintergrund',
    w4t: 'Community', w4s: 'Sozialer Hub mit Discord',
    sL1: 'Sprachen', sL2: 'Kostenlos', sL3: '24/7 Zugriff', sL4: 'Eine App',
    ctaLbl: 'Lass uns starten',
    ctaL1: 'Richte deine', ctaL2: 'Bibliothek heute ein.'
  },

  FR: {
    heroL1: 'Une nouvelle', heroL2: 'maison pour', heroL3: 'vos jeux & applis.',
    heroTag: 'Windows 10/11 · Client gratuit',
    heroIntro: 'Rassemblez vos jeux préférés dans une interface pratique. <strong>Téléchargez, restez à jour, gardez le lien.</strong>',
    heroScroll: 'Défiler',
    marqW1: 'Jeux', marqW2: 'Apps', marqW3: 'Communauté', marqW4: '7 Langues', marqW5: '100% Gratuit', marqW6: 'Windows 10/11',
    st1: 'Une nouvelle maison', st2: 'pour tous vos jeux.', st3: 'Téléchargez, restez à jour, gardez le lien.',
    aboutL: 'À propos',
    aboutReel: 'Découvrez Ürün Store',
    amL1: 'Plateforme', amL2: 'Système', amL3: 'Langue', amL4: 'Prix',
    amV4: '100% Gratuit',
    dlL: 'Télécharger',
    workL: 'Plateforme',
    w1t: 'Bibliothèque', w1s: 'Vos jeux au même endroit',
    w2t: 'Boutique', w2s: 'Téléchargements rapides et sûrs',
    w3t: 'Mise à jour', w3s: 'Automatique en arrière-plan',
    w4t: 'Communauté', w4s: 'Hub social avec Discord',
    sL1: 'Langues', sL2: 'Gratuit', sL3: 'Accès 24/7', sL4: 'Une seule app',
    ctaLbl: 'Commençons ensemble',
    ctaL1: 'Configurez votre', ctaL2: 'bibliothèque aujourd\'hui.'
  },

  ES: {
    heroL1: 'Un nuevo', heroL2: 'hogar para', heroL3: 'tus juegos y apps.',
    heroTag: 'Windows 10/11 · Cliente gratis',
    heroIntro: 'Reúne tus juegos favoritos en una interfaz práctica. <strong>Descarga, mantente al día, nunca pierdas el contacto.</strong>',
    heroScroll: 'Desplázate',
    marqW1: 'Juegos', marqW2: 'Apps', marqW3: 'Comunidad', marqW4: '7 Idiomas', marqW5: '100% Gratis', marqW6: 'Windows 10/11',
    st1: 'Un nuevo hogar', st2: 'para todos tus juegos.', st3: 'Descarga, mantente al día, nunca pierdas el contacto.',
    aboutL: 'Acerca de',
    aboutReel: 'Conoce Ürün Store',
    amL1: 'Plataforma', amL2: 'Sistema', amL3: 'Idioma', amL4: 'Precio',
    amV4: '100% Gratis',
    dlL: 'Descargar',
    workL: 'Plataforma',
    w1t: 'Biblioteca', w1s: 'Tus juegos en un solo lugar',
    w2t: 'Tienda', w2s: 'Descargas rápidas y seguras',
    w3t: 'Actualizador', w3s: 'Automático en segundo plano',
    w4t: 'Comunidad', w4s: 'Hub social con Discord',
    sL1: 'Idiomas', sL2: 'Gratis', sL3: 'Acceso 24/7', sL4: 'Una sola app',
    ctaLbl: 'Empecemos juntos',
    ctaL1: 'Configura tu', ctaL2: 'biblioteca hoy.'
  },

  RU: {
    heroL1: 'Новый дом', heroL2: 'для ваших', heroL3: 'игр и приложений.',
    heroTag: 'Windows 10/11 · Бесплатный клиент',
    heroIntro: 'Соберите любимые игры в одном удобном интерфейсе. <strong>Скачивайте, оставайтесь в курсе, не теряйте связь.</strong>',
    heroScroll: 'Листай',
    marqW1: 'Игры', marqW2: 'Приложения', marqW3: 'Сообщество', marqW4: '7 Языков', marqW5: '100% Бесплатно', marqW6: 'Windows 10/11',
    st1: 'Новый дом', st2: 'для всех ваших игр.', st3: 'Скачивайте, оставайтесь в курсе, не теряйте связь.',
    aboutL: 'О нас',
    aboutReel: 'Познакомьтесь с Ürün Store',
    amL1: 'Платформа', amL2: 'Система', amL3: 'Язык', amL4: 'Цена',
    amV4: '100% Бесплатно',
    dlL: 'Скачать',
    workL: 'Платформа',
    w1t: 'Библиотека', w1s: 'Ваши игры в одном месте',
    w2t: 'Магазин', w2s: 'Быстрые и безопасные загрузки',
    w3t: 'Обновления', w3s: 'Автоматически в фоне',
    w4t: 'Сообщество', w4s: 'Социальный хаб с Discord',
    sL1: 'Языки', sL2: 'Бесплатно', sL3: 'Доступ 24/7', sL4: 'Одно приложение',
    ctaLbl: 'Начнём вместе',
    ctaL1: 'Настройте свою', ctaL2: 'библиотеку сегодня.'
  },

  ZH: {
    heroL1: '游戏和应用', heroL2: '的全新', heroL3: '家园。',
    heroTag: 'Windows 10/11 · 免费客户端',
    heroIntro: '在一个实用界面中汇集你喜爱的游戏。<strong>下载、保持最新、永不失去联系。</strong>',
    heroScroll: '滚动',
    marqW1: '游戏', marqW2: '应用', marqW3: '社区', marqW4: '7 种语言', marqW5: '100% 免费', marqW6: 'Windows 10/11',
    st1: '为你所有游戏', st2: '准备的全新家园。', st3: '下载、保持更新、永不失去联系。',
    aboutL: '关于',
    aboutReel: '认识 Ürün Store',
    amL1: '平台', amL2: '系统', amL3: '语言', amL4: '价格',
    amV4: '100% 免费',
    dlL: '下载',
    workL: '平台',
    w1t: '游戏库', w1s: '集中管理你的游戏',
    w2t: '商店', w2s: '快速安全的下载',
    w3t: '自动更新', w3s: '后台自动更新',
    w4t: '社区', w4s: '与 Discord 的社交中心',
    sL1: '语言', sL2: '免费', sL3: '24/7 访问', sL4: '一个应用',
    ctaLbl: '一起开始吧',
    ctaL1: '今天就建立', ctaL2: '你的游戏库。'
  }
};

Object.keys(studioExtra).forEach(function (k) {
  if (!translations[k]) translations[k] = {};
  Object.assign(translations[k], studioExtra[k]);
});

/* ============================================================================
   ÖNCEKİ SÜRÜMDEN EKSİK KALAN TEMEL ANAHTARLAR (DE/FR/ES/RU/ZH)
   ============================================================================ */

const langGaps = {
  DE: {
    faq4_q: 'Werden meine Spiele automatisch aktualisiert?',
    faq4_a: 'Ja. Der Hintergrund-Updater bringt deine Bibliothek vor dem Start auf den neuesten Stand.',
    authVisualTitle: 'Ein Zuhause für deine Spiele.',
    authVisualSub: 'Erstelle ein kostenloses Konto, verwalte deine Bibliothek und tritt der Community bei.',
    authPerk1: 'Kostenlose Anmeldung in unter einer Minute',
    authPerk2: 'Bibliothek und Downloads geräteübergreifend synchron',
    authPerk3: 'Sichere Sitzungen auf Supabase-Infrastruktur',
    authWD: 'Bitte gib deine Daten ein.',
    authRem: 'Angemeldet bleiben',
    authNoAcc: 'Noch kein Konto? ',
    authJoinD: 'Registriere dich kostenlos für den Zugriff auf die Plattform.',
    authTerms: 'Nutzungsbedingungen und Datenschutz',
    authTerms2: ' habe ich gelesen und akzeptiere sie.',
    authHasAcc: 'Schon ein Konto? '
  },
  FR: {
    faq4_q: 'Mes jeux se mettent-ils à jour automatiquement ?',
    faq4_a: 'Oui. L\'outil d\'arrière-plan met à jour votre bibliothèque avant le lancement.',
    authVisualTitle: 'Une maison pour vos jeux.',
    authVisualSub: 'Créez un compte gratuit, gérez votre bibliothèque et rejoignez la communauté.',
    authPerk1: 'Inscription gratuite en moins d\'une minute',
    authPerk2: 'Bibliothèque et téléchargements synchronisés',
    authPerk3: 'Sessions sécurisées sur Supabase',
    authWD: 'Veuillez saisir vos informations.',
    authRem: 'Rester connecté',
    authNoAcc: 'Pas de compte ? ',
    authJoinD: 'Inscrivez-vous gratuitement pour accéder à la plateforme.',
    authTerms: 'Conditions d\'utilisation et politique de confidentialité',
    authTerms2: ' j\'ai lu et j\'accepte.',
    authHasAcc: 'Déjà un compte ? '
  },
  ES: {
    faq4_q: '¿Mis juegos se actualizan automáticamente?',
    faq4_a: 'Sí. El actualizador en segundo plano actualiza tu biblioteca antes de iniciar.',
    authVisualTitle: 'Un hogar para tus juegos.',
    authVisualSub: 'Crea una cuenta gratis, gestiona tu biblioteca y únete a la comunidad.',
    authPerk1: 'Registro gratuito en menos de un minuto',
    authPerk2: 'Biblioteca y descargas sincronizadas',
    authPerk3: 'Sesiones seguras en Supabase',
    authWD: 'Por favor, introduce tus datos.',
    authRem: 'Mantenerme conectado',
    authNoAcc: '¿No tienes cuenta? ',
    authJoinD: 'Regístrate gratis para acceder a la plataforma.',
    authTerms: 'Términos de uso y política de privacidad',
    authTerms2: ' he leído y acepto.',
    authHasAcc: '¿Ya tienes cuenta? '
  },
  RU: {
    faq4_q: 'Мои игры обновляются автоматически?',
    faq4_a: 'Да. Фоновый апдейтер обновляет библиотеку до запуска.',
    authVisualTitle: 'Один дом для ваших игр.',
    authVisualSub: 'Создайте бесплатный аккаунт, управляйте библиотекой и присоединяйтесь к сообществу.',
    authPerk1: 'Бесплатная регистрация меньше чем за минуту',
    authPerk2: 'Библиотека и загрузки синхронизированы',
    authPerk3: 'Безопасные сессии на Supabase',
    authWD: 'Введите свои данные.',
    authRem: 'Оставаться в системе',
    authNoAcc: 'Нет аккаунта? ',
    authJoinD: 'Зарегистрируйтесь бесплатно для доступа к платформе.',
    authTerms: 'Условия использования и политика конфиденциальности',
    authTerms2: ' прочитал(а) и принимаю.',
    authHasAcc: 'Уже есть аккаунт? '
  },
  ZH: {
    faq4_q: '我的游戏会自动更新吗？',
    faq4_a: '是的。后台更新器会在启动前将你的游戏库更新到最新版本。',
    authVisualTitle: '为你游戏准备的家园。',
    authVisualSub: '创建免费账户、管理你的游戏库并加入社区。',
    authPerk1: '一分钟内免费注册',
    authPerk2: '游戏库和下载跨设备同步',
    authPerk3: 'Supabase 基础设施保障安全会话',
    authWD: '请输入你的信息。',
    authRem: '保持登录',
    authNoAcc: '没有账户？',
    authJoinD: '免费注册以访问平台。',
    authTerms: '服务条款和隐私政策',
    authTerms2: ' 我已阅读并同意。',
    authHasAcc: '已有账户？'
  }
};

Object.keys(langGaps).forEach(function (k) {
  if (!translations[k]) translations[k] = {};
  Object.assign(translations[k], langGaps[k]);
});

let currentLang = localStorage.getItem('lang') || 'TR';

// innerHTML ile güvenle yazılabilen key'ler (yalnızca statik, kontrollü HTML içerir).
const HTML_I18N_KEYS = new Set(['heroIntro', 'heroTitle']);

function getText(key) {
  const t = translations[currentLang] || translations.EN;
  return t[key] || translations.EN[key] || translations.TR[key] || key;
}

function changeLanguage(langKey) {
  currentLang = langKey;
  localStorage.setItem('lang', langKey);
  const isTr = langKey === 'TR';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = getText(key);
    // Yalnızca güvenilir HTML içeren key'ler için innerHTML; diğerleri textContent.
    if (HTML_I18N_KEYS.has(key)) el.innerHTML = text;
    else el.textContent = text;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', getText(key));
  });

  document.querySelectorAll('[data-i18n-lang]').forEach(el => {
    const code = el.getAttribute('data-i18n-lang');
    el.textContent = (isTr && code === 'tr') ? 'Türkçe' :
      (code === 'tr' ? 'Türkçe' : code.toUpperCase());
  });

  document.querySelectorAll('.lang-option').forEach(el => {
    el.classList.toggle('active', el.dataset.lang === langKey);
  });
}

function toggleLangMenu() {
  const menu = document.getElementById('langMenu');
  if (menu) menu.classList.toggle('open');
}

function selectLang(langKey) {
  const menu = document.getElementById('langMenu');
  if (menu) menu.classList.remove('open');
  const trigger = document.getElementById('langTriggerText');
  if (trigger) trigger.textContent = langKey;
  changeLanguage(langKey);
}

/* ============================================================================
   İNİT
   ============================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('theme') || 'light');
  changeLanguage(currentLang);

  const trigger = document.getElementById('langTriggerText');
  if (trigger) trigger.textContent = currentLang;

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('langMenu');
    const triggerWrap = document.getElementById('langWrap');
    if (menu && triggerWrap && !triggerWrap.contains(e.target)) menu.classList.remove('open');
  });

  const loginEmail = document.getElementById('loginEmail');
  const loginPass = document.getElementById('loginPassword');
  if (loginEmail) loginEmail.addEventListener('input', validateLoginForm);
  if (loginPass) loginPass.addEventListener('input', validateLoginForm);

  const regUsername = document.getElementById('regUsername');
  const regEmail = document.getElementById('regEmail');
  const regPass = document.getElementById('regPassword');
  const regPass2 = document.getElementById('regPassword2');
  const kvkk = document.getElementById('kvkkCheck');
  if (regUsername) regUsername.addEventListener('input', validateRegisterForm);
  if (regEmail) regEmail.addEventListener('input', validateRegisterForm);
  if (regPass) regPass.addEventListener('input', validateRegisterForm);
  if (regPass2) regPass2.addEventListener('input', validateRegisterForm);
  if (kvkk) kvkk.addEventListener('change', validateRegisterForm);

  // Reveal on scroll — reduced motion destekli
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion) {
    revealEls.forEach(el => el.classList.add('active'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => observer.observe(el));
  }
});

/* ============================================================================
   PWA
   ============================================================================ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isSecure = window.location.protocol === 'https:' ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isSecure) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed.', err);
      });
    }
  });
}

if (sb) {
  try {
    sb.auth.onAuthStateChange(() => updateUI());
  } catch (e) { /* sessiz */ }
}

updateUI();