/* Anon anahtar ./config.js içinde (index.html kaynakta yok). service_role asla tarayıcıya koyma. Asıl koruma: Postgres RLS (supabase-security.sql). config.js yine Network’ten indirilebilir — bu, Supabase public anon modelidir; gizli veri RLS ile durur. */
const _cfg = typeof window.__URUNSTORE_CFG === 'object' && window.__URUNSTORE_CFG ? window.__URUNSTORE_CFG : null;
const SUPABASE_URL = _cfg && String(_cfg.supabaseUrl || '').trim();
const SUPABASE_KEY = _cfg && String(_cfg.supabaseAnonKey || '').trim();
let sb = null;
if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
  try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error(e); }
} else {
  console.warn('[UrunStore] ./config.js eksik veya hatali — config.sample.js dosyasini config.js yapip doldurun.');
}

let reqCount = 0;

setInterval(() => { reqCount = Math.max(0, reqCount - 2); }, 2000);
function checkSpamLimit() {
  reqCount++;
  if(reqCount > 8) {
    showToast('Sistem koruması: Çok hızlı işlem yapıyorsunuz. Lütfen bekleyin!', true);
    return false;
  }
  return true;
}
function checkSQLi(str) {
  if (!str) return true;
  const badPatterns = [/(--)/, /(;)/, /(' OR '1'='1)/i, /(\b(select|union|insert|update|delete|drop|alter)\b.*?(from|into|table|database))/i];
  for (let p of badPatterns) {
    if (p.test(str)) return false;
  }
  return true;
}
// === PROXY / VPN / CROXYPROXY TESPİT SİSTEMİ ===
const proxyDomains = ['croxyproxy','proxysite','hide.me','kproxy','filterbypass','unblocksite','vpnbook','hidemyass','webproxy','anonymouse','proxyfly','blockaway','unblockit','4everproxy','megaproxy'];

function detectProxy() {
  // 1) iframe içinde mi?
  if (window.self !== window.top) return true;
  // 2) Domain proxy mi?
  const host = window.location.hostname.toLowerCase();
  if (proxyDomains.some(p => host.includes(p))) return true;
  // 3) Referrer proxy mi?
  const ref = (document.referrer || '').toLowerCase();
  if (proxyDomains.some(p => ref.includes(p))) return true;
  // 4) CroxyProxy __cpo parametresi var mı? (CroxyProxy imzası)
  if (window.location.search.includes('__cpo=') || window.location.search.includes('__cpo%3D')) return true;
  // 5) Hostname ham IP adresi mi? (Proxy sunucuları IP ile servis eder)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // 6) Yalnızca kendi sitenizde çalışsın (kopya/phishing sayfalarını zayıflatır; tam güvenlik sunucu tarafındadır)
  const allowedDomains = ['urunstore.com', 'www.urunstore.com', 'urunstore.dev.tc', 'localhost', '127.0.0.1'];
  if (host && !allowedDomains.some(d => host === d || host.endsWith('.' + d))) return true;
  return false;
}

function blockProxy() {
  document.body.innerHTML = `<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background:#0a0a0a; color:#ef4444; font-family:sans-serif; text-align:center; gap:16px;">
    <div style="font-size:5rem;">🛡️</div>
    <h1 style="font-size:2rem; font-weight:700;">Proxy/VPN Tespit Edildi</h1>
    <p style="color:#888; font-size:1.1rem; max-width:500px;">Güvenlik nedeniyle proxy veya VPN üzerinden erişim engellenmektedir.<br>Lütfen doğrudan bağlantı kullanın.</p>
  </div>`;
  try { if(sb) sb.auth.signOut(); } catch(e){}
}

// Proxy kontrolü (anında çalışır)
if (detectProxy()) { 
  window.addEventListener('DOMContentLoaded', () => blockProxy());
}

// Shield kaldırma (HER ZAMAN çalışacak, takılmayacak)
window.addEventListener('DOMContentLoaded', () => {
  const shield = document.getElementById('ddosShield');
  if (!shield) return;
  setTimeout(() => {
    const st = document.getElementById('shieldStatus');
    if (st) { st.textContent = "Bağlantı güvenli, yönlendiriliyor..."; st.style.color = "var(--success)"; }
    setTimeout(() => {
      shield.style.opacity = '0';
      shield.style.pointerEvents = 'none';
      setTimeout(() => shield.remove(), 500);
    }, 800);
  }, 1500);
});

let currentUserIP = '';
let ipUpdatedThisSession = false;
async function checkIPBan() {
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    const data = await res.json();
    currentUserIP = data.ip;

    if (sb) {
      const { data: bData } = await sb.from('banned_ips').select('ip').eq('ip', currentUserIP).single();
      if (bData && bData.ip) {
        document.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100vh; background:#111; color:#ef4444; font-size:2rem; font-family:sans-serif; text-align:center;">Erişim Engellendi<br>(IP Ban)</div>';
        try { await sb.auth.signOut(); } catch(e){}
        throw new Error("IP Banned");
      }
      if (!ipUpdatedThisSession) {
        sb.auth.getSession().then(({data:{session}}) => {
          if (session?.user?.email) {
            const ipToSave = currentUserIP;
            sb.from('user_profiles').update({ last_ip: ipToSave }).eq('email', session.user.email).then();
            ipUpdatedThisSession = true;
          }
        });
      }
    }
  } catch(e) {}
}
checkIPBan();

let lastEmail = ""; let lastType = "signup"; 

function openModal(t){
  document.getElementById('modalOverlay').classList.add('open');
  ['settings','otp','download','kvkk'].forEach(m => {
    const el = document.getElementById(m+'Modal');
    if (el) el.style.display = t===m ? 'block' : 'none';
  });
  clearErrors();
}
function closeModal(){document.getElementById('modalOverlay').classList.remove('open')}
function closeModalOutside(e){if(e.target===document.getElementById('modalOverlay'))closeModal()}
function switchModal(t){openModal(t)}

function openAuth(type) {
  // Dropdown açıksa kapat
  const langOpts = document.getElementById('langOptions');
  if (langOpts) langOpts.classList.remove('show');
  
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('navbar').style.display = 'none';
  document.getElementById('authPage').classList.add('show');
  switchAuth(type);
  clearErrors();
}
function closeAuth() {
  document.getElementById('authPage').classList.remove('show');
  document.getElementById('navbar').style.display = 'flex';
  if (sb) {
    sb.auth.getSession().then(({data:{session}}) => {
      if(session?.user) showDashboard();
      else goHome();
    }).catch(() => goHome());
  } else goHome();
}
function switchAuth(type) {
  document.getElementById('authLoginPanel').style.display = type === 'login' ? 'block' : 'none';
  document.getElementById('authRegisterPanel').style.display = type === 'register' ? 'block' : 'none';
}
function togglePassword(inputId, iconElement) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    iconElement.classList.replace('fa-eye', 'fa-eye-slash');
    document.getElementById('charContainer').classList.add('focused-away');
  } else {
    input.type = 'password';
    iconElement.classList.replace('fa-eye-slash', 'fa-eye');
    document.getElementById('charContainer').classList.remove('focused-away');
  }
}
document.addEventListener('mousemove', (e) => {
  const container = document.getElementById('charContainer');
  if (!container || !document.getElementById('authPage').classList.contains('show')) return;
  if (container.classList.contains('focused-away')) return;
  document.querySelectorAll('.pupil').forEach(pupil => {
    const rect = pupil.parentElement.getBoundingClientRect();
    const eyeCenterX = rect.left + rect.width / 2;
    const eyeCenterY = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - eyeCenterY, e.clientX - eyeCenterX);
    const maxMove = 3; 
    const dx = Math.cos(angle) * maxMove;
    const dy = Math.sin(angle) * maxMove;
    pupil.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
});

function clearErrors(){document.querySelectorAll('.form-error').forEach(e=>{e.textContent='';e.classList.remove('show')})}
function showError(id,msg){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.classList.add('show')}

async function insertUserProfileRow(username,email){
  if(!sb)return;
  const{error}=await sb.from('user_profiles').insert([{username,email,last_ip:currentUserIP||null}]);
  if(error){
    const msg=formatSupabaseErr(error);
    notifyAuthProblem('regEmailErr',msg);
    throw error;
  }
}

async function handleRegister(e){
  e.preventDefault();clearErrors();
  if(!sb){notifyAuthProblem('regEmailErr',(typeof currentLang!=='undefined'&&currentLang!=='TR')?'Cannot connect. Refresh the page.':'Bağlantı yok. Sayfayı yenileyin.');return;}
  if(!checkSpamLimit())return;
  const username=document.getElementById('regUsername').value.trim();
  const email=document.getElementById('regEmail').value.trim();
  const pass=document.getElementById('regPassword').value;
  const pass2=document.getElementById('regPassword2').value;

  if(!checkSQLi(username)){
    notifyAuthProblem('regUsernameErr','Sistem koruması: kullanıcı adında engellenen ifade var.');
    return;
  }
  if(!checkSQLi(email)){
    notifyAuthProblem('regEmailErr','Sistem koruması: e-postada engellenen ifade var.');
    return;
  }

  if(pass!==pass2){notifyAuthProblem('regPassword2Err','Şifreler eşleşmiyor.');return}

  const btn=document.getElementById('regBtn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> İşleniyor...';

  try{
    const unameRpc=await sb.rpc('is_username_taken',{check_username:username});
    if(unameRpc.error&&!isRpcFnMissing(unameRpc.error)){
      notifyAuthProblem('regUsernameErr',formatSupabaseErr(unameRpc.error));
      throw unameRpc.error;
    }
    if(!unameRpc.error&&rpcBoolTrue(unameRpc.data)){
      notifyAuthProblem('regUsernameErr','Bu kullanıcı adı başka bir hesapta (başka bir e-posta ile) kayıtlı. Farklı bir kullanıcı adı seç veya o hesabın e-postasıyla giriş yap.');
      document.getElementById('regUsername').focus();
      return;
    }
    if(unameRpc.error&&isRpcFnMissing(unameRpc.error)){
      const tr=typeof currentLang==='undefined'||currentLang==='TR';
      showToast(tr?'İpucu: supabase-rpc-auth.sql dosyasını Supabase’te çalıştırırsanız kullanıcı adı kontrolü de aktif olur.':'Tip: run supabase-rpc-auth.sql in Supabase for username checks.',false,4500);
    }

    const{data,error}=await sb.auth.signUp({email,password:pass,options:{data:{username}}});
    if(error){
      if(error.status===429)throw new Error((typeof currentLang!=='undefined'&&currentLang!=='TR')?'Too many requests. Wait and try again.':'Çok fazla istek; bir süre sonra tekrar deneyin.');
      throw error;
    }
    const trReg=typeof currentLang==='undefined'||currentLang==='TR';
    async function finishSignupSession(){
      closeAuth();
      showToast(trReg?'Kayıt başarılı! Hoş geldin.':'Welcome! Account ready.');
      showDashboard();
      await updateUI();
    }
    if(data.user&&data.session){
      try{await insertUserProfileRow(username,email);}
      catch(_){showToast(trReg?'Hesap açıldı; profil satırı eklenemedi (sunucu). Ayarlardan tekrar dene veya destek.':'Account created but profile row failed.',true);}
      await finishSignupSession();
    }else if(data.user){
      if(data.user.identities&&data.user.identities.length===0){
        const{data:siDup,error:dupErr}=await sb.auth.signInWithPassword({email,password:pass});
        if(!dupErr&&siDup.session){
          try{await insertUserProfileRow(username,email);}catch(_){}
          try{await sb.from('user_profiles').update({username}).eq('email',email);}catch(_){}
          showToast(trReg?'Bu e-posta zaten kayıtlıydı; şifre doğru, hesabına giriş yaptık.':'That email was already registered; signed you in.',false,4200);
          await finishSignupSession();
        }else{
          notifyAuthProblem('regEmailErr',dupErr&&String(dupErr.message||'').includes('Invalid')?trReg?'Bu e-posta kayıtlı; şifre yanlış. Aşağıdan giriş dene.':'Wrong password for this email.':(dupErr?formatSupabaseErr(dupErr):(trReg?'Bu e-posta kayıtlı; giriş yap.':'Please sign in.')));
          switchAuth('login');
          const le=document.getElementById('loginEmail');if(le)le.value=email;
          const lp=document.getElementById('loginPassword');if(lp)lp.value='';
          validateLoginForm();
        }
        return;
      }
      const{data:signInData,error:e2}=await sb.auth.signInWithPassword({email,password:pass});
      if(!e2&&signInData.session){
        try{await insertUserProfileRow(username,email);}
        catch(_){showToast(trReg?'Giriş yapıldı; profil eklenemedi. Ayarlar veya destek.':'Signed in; profile insert failed.',true);}
        await finishSignupSession();
      }else{
        const needMail=(e2&&String(e2.message||'').toLowerCase().includes('confirm'))||(!e2&&!signInData?.session);
        switchAuth('login');
        const le=document.getElementById('loginEmail');if(le)le.value=email;
        if(needMail){
          notifyAuthProblem('regEmailErr',trReg?'Hesap oluştu. Gelen kutundaki doğrulama linkine tıkla; ardından "Giriş Yap" ile devam et.':'Confirm your email, then use Sign in.');
          const lp=document.getElementById('loginPassword');if(lp)lp.value=pass;
          showToast(trReg?'Giriş sekmesi açıldı; maili onayladıktan sonra aynı şifreyle giriş yap.':'Login tab opened; after email confirm, sign in with the same password.',false,5500);
        }else{
          notifyAuthProblem('regEmailErr',e2?formatSupabaseErr(e2):trReg?'Oturum açılamadı; tekrar dene.':'Could not sign in.');
        }
        validateLoginForm();
      }
    }
  }catch(err){
    notifyAuthProblem('regEmailErr',formatSupabaseErr(err));
  }finally{
    btn.disabled=false;btn.textContent='Kayıt Ol';
  }
}

async function handleLogin(e){
  e.preventDefault();clearErrors();
  if(!sb){notifyAuthProblem('loginEmailErr',(typeof currentLang!=='undefined'&&currentLang!=='TR')?'Cannot connect. Refresh the page.':'Bağlantı yok. Sayfayı yenileyin.');return;}
  if(!checkSpamLimit())return;
  let email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPassword').value;
  const btn=document.getElementById('loginBtn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> İşleniyor...';

  if(!checkSQLi(email)){
    notifyAuthProblem('loginEmailErr','Sistem koruması: giriş bilgisinde engellenen ifade var.');
    btn.disabled=false;btn.textContent='Giriş Yap';
    return;
  }

  try{
    if(sb&&!email.includes('@')){
      const{data:resolvedEmail,error:rpcE}=await sb.rpc('profile_email_by_username',{login:email});
      if(rpcE&&isRpcFnMissing(rpcE)){
        const tr=typeof currentLang==='undefined'||currentLang==='TR';
        notifyAuthProblem('loginEmailErr',tr?'Kullanıcı adı ile giriş için Supabase’te `supabase-rpc-auth.sql` çalıştırılmalı. Şimdilik tam e-posta adresinizle giriş yapın.':'Run supabase-rpc-auth.sql for username login; use full email for now.');
        return;
      }
      if(rpcE||!resolvedEmail){
        const tr=typeof currentLang==='undefined'||currentLang==='TR';
        const msg=rpcE?formatSupabaseErr(rpcE):(tr?'Bu kullanıcı adı sistemde bulunamadı.':'Username not found.');
        notifyAuthProblem('loginEmailErr',msg);
        throw new Error(msg);
      }
      email=resolvedEmail;
    }

    const{error}=await sb.auth.signInWithPassword({email,password:pass});
    if(error)throw error;
    if(sb&&currentUserIP)sb.from('user_profiles').update({last_ip:currentUserIP}).eq('email',email).then(({error:upErr})=>{if(upErr)console.warn('last_ip update',upErr);});
    closeAuth();
    showToast('Giriş başarılı.');showDashboard();updateUI();
  }catch(err){
    const msg=formatSupabaseErr(err);
    notifyAuthProblem('loginPasswordErr',msg);
  }finally{
    btn.disabled=false;btn.textContent='Giriş Yap';
  }
}

async function logout(){
  if(sb){try{await sb.auth.signOut()}catch(e){}}
  showToast('Çıkış yapıldı.'); updateUI();
}

async function updateUI(){
  let user=null;
  if(sb){
    try{
      const{data:{session}}=await sb.auth.getSession();
      if(session?.user) {
        user={
          username:session.user.user_metadata?.username || session.user.email.split('@')[0],
          email:session.user.email,
          created: new Date(session.user.created_at).toLocaleDateString('tr-TR'),
          id: session.user.id
        };
      }
    }catch(e){}
  }

  if(user){
    document.getElementById('authButtons').style.display='none';
    document.getElementById('navUser').style.display='flex';
    document.getElementById('navAvatar').textContent=user.username[0].toUpperCase();
    document.getElementById('navUsername').textContent=user.username;
    
    document.getElementById('dashAvatar').textContent=user.username[0].toUpperCase();
    document.getElementById('dashUsername').textContent=user.username;
    document.getElementById('dashEmail').textContent=user.email;
    
    document.getElementById('infoUsername').textContent=user.username;
    document.getElementById('infoEmail').textContent=user.email;
    document.getElementById('infoId').textContent=user.id;
    document.getElementById('infoCreated').textContent=user.created;
    
    document.getElementById('updateUsername').value = user.username;
    document.getElementById('updateEmail').value = user.email;

    if (!window.initialLayoutSet) {
      window.initialLayoutSet = true;
      showDashboard();
    }
    
  }else{
    window.initialLayoutSet = true;
    document.getElementById('authButtons').style.display='flex';
    document.getElementById('navUser').style.display='none';
    
    goHome();
  }
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const username = document.getElementById('updateUsername').value.trim();
  const email = document.getElementById('updateEmail').value.trim();
  const btn = document.getElementById('btnUpdateProfile');
  btn.disabled = true;

  if (sb) {
    try {
      const { error } = await sb.auth.updateUser({ email, data: { username } });
      if (error) throw error;
      showToast('Profil güncellendi!'); updateUI();
    } catch (err) { showToast('Hata: ' + err.message, true); }
  }
  btn.disabled = false;
}

async function handleSendPasswordReset(e) {
  e.preventDefault();
  let currentEmail = document.getElementById('infoEmail').textContent;
  if (!currentEmail || currentEmail === '-') return;
  
  if (sb) {
    try { await sb.auth.resetPasswordForEmail(currentEmail); showToast('Bağlantı gönderildi!'); }
    catch (err) { showToast('Hata oluştu.', true); }
  }
}

async function handleVerifyOTP(e) {
  e.preventDefault();
  const code = document.getElementById('otpCode').value.trim();
  const err = document.getElementById('otpError'); err.classList.remove('show');
  if (code.length !== 6) return;

  try {
    const { error } = await sb.auth.verifyOtp({ email: lastEmail, token: code, type: lastType });
    if (error) throw error;
    closeModal(); showToast('E-posta başarıyla doğrulandı.'); showDashboard(); updateUI();
  } catch (err) { showError('otpError', 'Geçersiz veya süresi dolmuş kod.'); }
}

async function resendOTP() {
  if (!lastEmail) return;
  try { await sb.auth.resend({ type: lastType, email: lastEmail }); showToast('Yeni kod gönderildi.'); }
  catch (e) { showToast('Hata oluştu.', true); }
}



function goHome() {
  const main = document.getElementById('mainContent');
  const dash = document.getElementById('dashboard');
  main.style.display = 'block';
  main.style.opacity = '0';
  setTimeout(() => main.style.opacity = '1', 10);
  dash.style.opacity = '0';
  setTimeout(() => {
    dash.style.display = 'none';
    dash.classList.remove('show');
  }, 400);
  window.scrollTo({top:0, behavior:'smooth'});
}

function showDashboard() {
  const main = document.getElementById('mainContent');
  const dash = document.getElementById('dashboard');
  main.style.opacity = '0';
  window.scrollTo({top:0, behavior:'smooth'});
  setTimeout(() => {
    main.style.display = 'none';
    dash.style.display = 'block';
    dash.classList.add('show');
    dash.style.opacity = '0';
    setTimeout(() => dash.style.opacity = '1', 10);
  }, 400);
}
function toggleMenu() {
  const menu = document.getElementById('navLinks');
  menu.classList.toggle('active');
}



function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  const icon = document.querySelector('#themeToggleBtn i');
  if (icon) {
    icon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const icon = document.querySelector('#themeToggleBtn i');
  if (icon) {
    icon.className = savedTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
  }
});


function showToast(msg,isError,customMs){
  const t=document.getElementById('toast');
  const m=document.getElementById('toastMsg');
  if(!t||!m)return;
  t.className='toast show '+(isError?'error':'');
  m.textContent=msg;
  const ms=customMs!=null?customMs:(isError?6000:3200);
  setTimeout(()=>t.classList.remove('show'),ms);
}

function isRpcFnMissing(err){
  if(!err)return false;
  const m=String(err.message||'')+String(err.details||'')+String(err.hint||'');
  return /could not find the function|schema cache|function public\.is_username_taken|function public\.profile_email_by_username/i.test(m);
}

function rpcBoolTrue(v){
  return v===true||v==='true'||v==='t'||v===1;
}

function formatSupabaseErr(err){
  if(!err)return typeof currentLang!=='undefined'&&currentLang!=='TR'?'Unknown error.':'Bilinmeyen hata oluştu.';
  const raw=String(err.message||err.error_description||err);
  const m=raw.toLowerCase();
  const tr=typeof currentLang==='undefined'||currentLang==='TR';
  if(m.includes('could not find the function')||m.includes('schema cache'))return tr?'Veritabanı fonksiyonu henüz yok veya önbellek güncellenmedi. Supabase → SQL Editor’da `supabase-rpc-auth.sql` dosyasını çalıştırın; 1–2 dk bekleyip sayfayı yenileyin.':'Run `supabase-rpc-auth.sql` in Supabase SQL Editor, wait 1–2 min, refresh.';
  if(raw.includes('Invalid login credentials')||m.includes('invalid login'))return tr?'Hatalı e-posta veya şifre.':'Wrong email or password.';
  if(m.includes('email not confirmed')||m.includes('email_not_confirmed'))return tr?'Önce e-postanızdaki doğrulama bağlantısına tıklayın.':'Please confirm your email first.';
  if(m.includes('user already registered')||m.includes('already registered'))return tr?'Bu e-posta zaten kayıtlı; giriş yapın.':'This email is already registered.';
  if(m.includes('duplicate')||m.includes('unique')||err.code==='23505')return tr?'Bu kullanıcı adı veya e-posta zaten kullanımda.':'Username or email already in use.';
  if(m.includes('row-level security')||err.code==='42501')return tr?'Sunucu güvenlik kuralı bu işlemi reddetti.':'This action was blocked by security rules.';
  if(m.includes('jwt expired'))return tr?'Oturum süresi doldu; tekrar giriş yapın.':'Session expired; please sign in again.';
  if(err.code==='PGRST116')return tr?'Kayıt bulunamadı.':'Not found.';
  return raw||(tr?'İşlem başarısız.':'Something went wrong.');
}

function notifyAuthProblem(fieldId,msg){
  if(fieldId)showError(fieldId,msg);
  showToast(msg,true);
}

if(sb){ 
  try {
    sb.auth.onAuthStateChange((event, session) => {
      updateUI();
    })
  }catch(e){} 
}

updateUI();

// ANIMATIONS LOGIC
document.addEventListener('DOMContentLoaded', () => {
  const observerOptions = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});

/* MULTI-LANGUAGE */
const translations = {
  TR: {
    brandName: "ÜRÜN <span class='text-primary'>STORE</span>",
    navHome: "Ana Sayfa", navAbout: "Hakkında", navFeatures: "Özellikler", navCommunity: "Topluluk", navLogin: "Giriş", navRegister: "Kayıt Ol",
    galleryTitle: "Arayüz <span class='text-primary'>Görselleri</span>", gal1: "Kütüphane Görünümü", gal2: "İndirme Yöneticisi", gal3: "Mağaza Sekmesi",
    heroTitle: "Oyun ve Uygulamaların <br>Yepyeni Evi.", heroDesc: "Ürün Store, favori oyunlarınızı tek bir pratik arayüzde birleştirir. İndirin, her zaman güncel kalın ve toplulukla etkileşimi koparmayın.",
    aboutTitle: "Tek Platform, Sınırsız Deneyim.", aboutDesc: "Ürün Store, ihtiyacınız olan her şeyi basit ve düzenli bir yapıda sunar. Kütüphanenizi yönetin, indirmeleri başlatın ve karmaşık menülerde kaybolmadan arkadaşlarınızla iletişimde kalın.", aboutBtn: "Hesap Oluştur",
    featuresTitle: "Neden Bizi <span class='text-primary'>Tercih Etmelisiniz?</span>",
    f1Title: "Hızlı İndirme", f1Desc: "Optimize edilmiş sunucularımız sayesinde oyunlarınızı saniyeler içinde kütüphanenize ekleyin ve hemen başlayın.",
    f2Title: "Otomatik Güncelleme", f2Desc: "Arka planda çalışan sistemimiz, siz oyuna girmeden önce tüm dosyalarınızı en güncel halinde tutar.",
    f3Title: "Sosyal Hub", f3Desc: "Arkadaşlarınızın ne oynadığını anında görün, sohbet edin ve Discord entegrasyonuyla gruplara katılın.",
    winTitle: "Windows İçin İndir", winDesc: "Windows 10 / 11 uyumlu • Kurulum dosyası (.exe)", dlBtn: "İndir",
    faqTitle: "Sıkça Sorulan <span class='text-primary'>Sorular</span>", faq1_q: "Uygulama tamamen ücretsiz mi?", faq1_a: "Evet, Ürün Store istemcisini indirmek ve kullanmak tamamen ücretsizdir. Ancak platform içindeki bazı oyunlar ücretli olabilir.",
    faq2_q: "Hangi işletim sistemlerini destekliyor?", faq2_a: "Şu anda Windows 10/11 desteği aktif. Linux versiyonumuz geliştirme aşamasındadır.", faq3_q: "Hesap bilgilerim güvende mi?", faq3_a: "Kesinlikle. Şifreleriniz ve kişisel verileriniz Supabase altyapısıyla korunur.",
    winTab: "Windows", comingSoon: "Yakında", discordPla: "Gelişmelerden haberdar olmak için Discord'a katıl",
    winSafe: "Güvenli indirme • GitHub Releases üzerinden sunulmaktadır",
    dashWelcome: "Hoş Geldin", dashUser: "Kullanıcı Adı", dashEmail: "E-posta", dashId: "Hesap ID", dashDate: "Kayıt Tarihi", dashStat: "Durum", dashAct: "Onaylı", dashOut: "Çıkış Yap", dashDlBtn: "Programı İndir", dashSet: "Ayarlar", dashSum: "Hesap Özeti",
    authBack: "Geri Dön", authW: "Hoş Geldin!", authWD: "Lütfen detaylarını gir.", authPass: "Şifre", authRem: "30 gün hatırla", authFor: "Şifremi unuttum", authLog: "Giriş Yap", authNoAcc: "Hesabın yok mu? ", authJoin: "Aramıza Katıl", authJoinD: "Platforma giriş yapmak için ücretsiz kayıt ol.", authPass2: "Şifre tekrar", authPass2P: "Şifrenizi doğrulayın", authTerms: "Kullanım Koşulları ve KVKK Aydınlatma Metni'ni", authTerms2: " okudum, anladım ve kabul ediyorum.", authReg: "Hesap Oluştur",     authHasAcc: "Hesabın var mı? ",
    footerAllRights: "Tüm Hakları Saklıdır.",
    authGoogle: "Google ile Giriş Yap", authGoogleReg: "Google ile Kayıt Ol", authOr: "veya"
  },
  EN: {
    brandName: "PRODUCT <span class='text-primary'>STORE</span>",
    navHome: "Home", navAbout: "About Us", navFeatures: "Features", navCommunity: "Community", navLogin: "Login", navRegister: "Sign Up",
    galleryTitle: "Interface <span class='text-primary'>Showcase</span>", gal1: "Library View", gal2: "Download Manager", gal3: "Store Tab",
    heroTitle: "A Brand New Home <br>for Games & Apps.", heroDesc: "Product Store combines your favorite games in a single practical interface. Download, stay up to date, and never lose touch with the community.",
    aboutTitle: "One Platform, Limitless Experience.", aboutDesc: "Product Store provides everything you need in a simple and organized structure. Manage your library, start downloads, and communicate with friends without getting lost in complex menus.", aboutBtn: "Create Account",
    featuresTitle: "Why Should You <span class='text-primary'>Choose Us?</span>",
    f1Title: "Fast Downloading", f1Desc: "Adding games to your library takes seconds thanks to our optimized servers. Start playing right away.",
    f2Title: "Auto Updates", f2Desc: "Our background system keeps all your files up-to-date before you even enter the game.",
    f3Title: "Social Hub", f3Desc: "Instantly see what your friends are playing, chat, and join groups with Discord integration.",
    winTitle: "Download for Windows", winDesc: "Windows 10 / 11 compatible • Installer file (.exe)", dlBtn: "Download",
    faqTitle: "Frequently Asked <span class='text-primary'>Questions</span>", faq1_q: "Is the app completely free?", faq1_a: "Yes, downloading and using the Product Store client is completely free. However, specific games might be paid.",
    faq2_q: "Which operating systems are supported?", faq2_a: "Currently, Windows 10/11 support is active.", faq3_q: "Are my account details safe?", faq3_a: "Absolutely. Passwords and personal data are protected by Supabase.",
    winTab: "Windows", comingSoon: "Coming Soon", discordPla: "Join Discord to stay updated",
    winSafe: "Secure download • Provided via GitHub Releases",
    dashWelcome: "Welcome", dashUser: "Username", dashEmail: "Email", dashId: "Account ID", dashDate: "Registration Date", dashStat: "Status", dashAct: "Verified", dashOut: "Log Out", dashDlBtn: "Download App", dashSet: "Settings", dashSum: "Account Summary",
    authBack: "Go Back", authW: "Welcome Back!", authWD: "Please enter your details.", authPass: "Password", authRem: "Remember 30 days", authFor: "Forgot password", authLog: "Login", authNoAcc: "Don't have an account? ", authJoin: "Join Us", authJoinD: "Sign up for free to access the platform.", authPass2: "Repeat password", authPass2P: "Verify your password", authTerms: "Terms of Service and Privacy Policy", authTerms2: " I have read and agree.", authReg: "Create Account",     authHasAcc: "Already have an account? ",
    footerAllRights: "All Rights Reserved.",
    authGoogle: "Sign in with Google", authGoogleReg: "Sign up with Google", authOr: "or"
  },
  DE: {
    brandName: "PRODUKT <span class='text-primary'>STORE</span>",
    navHome: "Startseite", navAbout: "Über Uns", navFeatures: "Funktionen", navCommunity: "Gemeinschaft", navLogin: "Anmelden", navRegister: "Registrieren",
    galleryTitle: "Schnittstellen <span class='text-primary'>Galerie</span>", gal1: "Bibliotheksansicht", gal2: "Download-Manager", gal3: "Store-Tab",
    heroTitle: "Ein ganz neues Zuhause <br>für Spiele & Apps.", heroDesc: "Produkt Store vereint Ihre Lieblingsspiele in einer einzigen praktischen Benutzeroberfläche. Laden Sie herunter, bleiben Sie auf dem Laufenden.",
    aboutTitle: "Eine Plattform, grenzenlose Erfahrung.", aboutDesc: "Produkt Store bietet alles, was Sie brauchen, in einer einfachen und organisierten Struktur.", aboutBtn: "Konto erstellen",
    featuresTitle: "Warum sollten Sie <span class='text-primary'>uns wählen?</span>",
    f1Title: "Schnelles Herunterladen", f1Desc: "Das Hinzufügen von Spielen zu Ihrer Bibliothek dauert dank unserer optimierten Server nur Sekunden.",
    f2Title: "Automatische Updates", f2Desc: "Unser Hintergrundsystem hält alle Ihre Dateien auf dem neuesten Stand.",
    f3Title: "Sozialer Hub", f3Desc: "Sehen Sie sofort, was Ihre Freunde spielen, chatten Sie und treten Sie Gruppen bei.",
    winTitle: "Download für Windows", winDesc: "Windows 10 / 11 kompatibel • Installationsdatei (.exe)", dlBtn: "Herunterladen",
    faqTitle: "Häufig gestellte <span class='text-primary'>Fragen</span>", faq1_q: "Ist die App völlig kostenlos?", faq1_a: "Ja, der Download und die Nutzung sind völlig kostenlos.",
    faq2_q: "Welche Betriebssysteme werden unterstützt?", faq2_a: "Derzeit wird Windows 10/11 unterstützt. Unsere Linux-Version ist in Entwicklung.",     faq3_q: "Sind meine Kontodaten sicher?", faq3_a: "Absolut. Alle Daten sind geschützt."
  },
  FR: {
    brandName: "PRODUIT <span class='text-primary'>STORE</span>",
    navHome: "Accueil", navAbout: "À Propos", navFeatures: "Fonctionnalités", navCommunity: "Communauté", navLogin: "Connexion", navRegister: "S'inscrire",
    galleryTitle: "Vitrine <span class='text-primary'>Interface</span>", gal1: "Vue Bibliothèque", gal2: "Gestionnaire de Téléchargement", gal3: "Onglet Magasin",
    heroTitle: "Une toute nouvelle maison <br>pour Jeux & Apps.", heroDesc: "Le Produit Store combine vos jeux préférés dans une seule interface pratique.",
    aboutTitle: "Une Plateforme, Expérience Illimitée.", aboutDesc: "Produit Store fournit tout ce dont vous avez besoin dans une structure simple et organisée.", aboutBtn: "Créer un Compte",
    featuresTitle: "Pourquoi devriez-vous <span class='text-primary'>nous choisir?</span>",
    f1Title: "Téléchargement Rapide", f1Desc: "Ajouter des jeux à votre bibliothèque prend quelques secondes.",
    f2Title: "Mises à jour Automatiques", f2Desc: "Notre système en arrière-plan maintient tous vos fichiers à jour.",
    f3Title: "Hub Social", f3Desc: "Voyez instantanément ce à quoi vos amis jouent.",
    winTitle: "Télécharger pour Windows", winDesc: "Compatible Windows 10 / 11 • Fichier d'installation (.exe)", dlBtn: "Télécharger",
    faqTitle: "Questions <span class='text-primary'>Fréquentes</span>", faq1_q: "L'application est-elle gratuite ?", faq1_a: "Oui, c'est totalement gratuit.",
    faq2_q: "Quels systèmes d'exploitation ?", faq2_a: "Windows 10/11 est pris en charge. Linux est en développement.",     faq3_q: "Mes données sont-elles en sécurité ?", faq3_a: "Absolument."
  },
  ES: {
    brandName: "PRODUCTO <span class='text-primary'>STORE</span>",
    navHome: "Inicio", navAbout: "Sobre Nosotros", navFeatures: "Características", navCommunity: "Comunidad", navLogin: "Iniciar sesión", navRegister: "Registrarse",
    galleryTitle: "Galería de <span class='text-primary'>Interfaz</span>", gal1: "Vista de Biblioteca", gal2: "Gestor de Descargas", gal3: "Pestaña de Tienda",
    heroTitle: "Un Nuevo Hogar <br>para Juegos y Apps.", heroDesc: "Producto Store combina tus juegos favoritos en una única interfaz práctica.",
    aboutTitle: "Una Plataforma, Experiencia Ilimitada.", aboutDesc: "Producto Store proporciona todo lo que necesitas en una estructura simple.", aboutBtn: "Crear Cuenta",
    featuresTitle: "¿Por qué <span class='text-primary'>elegirnos?</span>",
    f1Title: "Descarga Rápida", f1Desc: "Añadir juegos a tu biblioteca lleva segundos gracias a nuestros servidores optimizados.",
    f2Title: "Actualizaciones Automáticas", f2Desc: "Nuestro sistema mantiene todos tus archivos actualizados.",
    f3Title: "Centro Social", f3Desc: "Ve instantáneamente a qué juegan tus amigos y chatea con ellos.",
    winTitle: "Descargar para Windows", winDesc: "Compatible con Windows 10 / 11 • Archivo de instalación (.exe)", dlBtn: "Descargar",
    faqTitle: "Preguntas <span class='text-primary'>Frecuentes</span>", faq1_q: "¿Es totalmente gratis?", faq1_a: "Sí, es completamente gratis para descargar y usar.",
    faq2_q: "¿Qué sistemas operativos soporta?", faq2_a: "Windows 10/11. Linux en desarrollo.",     faq3_q: "¿Están seguros mis datos?", faq3_a: "Absolutamente."
  },
  RU: {
    brandName: "ПРОДУКТ <span class='text-primary'>STORE</span>",
    navHome: "Главная", navAbout: "О Нас", navFeatures: "Функции", navCommunity: "Сообщество", navLogin: "Войти", navRegister: "Регистрация",
    galleryTitle: "Галерея <span class='text-primary'>Интерфейса</span>", gal1: "Библиотека", gal2: "Менеджер Загрузок", gal3: "Магазин",
    heroTitle: "Новый Дом <br>для Игр и Приложений.", heroDesc: "Продукт Store объединяет ваши любимые игры в одном удобном интерфейсе.",
    aboutTitle: "Одна Платформа, Безграничный Опыт.", aboutDesc: "Продукт Store предоставляет все необходимое в простой и понятной структуре.", aboutBtn: "Создать Аккаунт",
    featuresTitle: "Почему <span class='text-primary'>Выбирают Нас?</span>",
    f1Title: "Быстрая Загрузка", f1Desc: "Добавление игр в библиотеку занимает секунды благодаря нашим серверам.",
    f2Title: "Автообновления", f2Desc: "Наша система автоматически обновляет ваши файлы.",
    f3Title: "Социальный Центр", f3Desc: "Общайтесь с друзьями и присоединяйтесь к группам.",
    winTitle: "Скачать для Windows", winDesc: "Совместимо с Windows 10 / 11 • Файл установки (.exe)", dlBtn: "Скачать",
    faqTitle: "Частые <span class='text-primary'>Вопросы</span>", faq1_q: "Это приложение полностью бесплатное?", faq1_a: "Да, загрузка и использование абсолютно бесплатны.",
    faq2_q: "Какие ОС поддерживаются?", faq2_a: "Windows 10/11. Linux в разработке.",     faq3_q: "Мои данные в безопасности?", faq3_a: "Абсолютно."
  },
  ZH: {
    brandName: "产品 <span class='text-primary'>商店</span>",
    navHome: "首页", navAbout: "关于我们", navFeatures: "特点", navCommunity: "社区", navLogin: "登录", navRegister: "注册",
    galleryTitle: "界面 <span class='text-primary'>展示</span>", gal1: "图书馆视图", gal2: "下载管理器", gal3: "商店标签",
    heroTitle: "游戏和应用的新家。", heroDesc: "产品商店在一个使用的界面中结合了你最喜欢的游戏。下载，了解最新动态。",
    aboutTitle: "一个平台，无限体验。", aboutDesc: "产品商店以简单和有组织的结构提供您需要的一切。", aboutBtn: "创建帐户",
    featuresTitle: "为什么 <span class='text-primary'>选择我们？</span>",
    f1Title: "快速下载", f1Desc: "感谢优化的服务器，将游戏添加到您的图书馆只需数秒。",
    f2Title: "自动更新", f2Desc: "我们的后台系统会不断更新您的所有文件。",
    f3Title: "社交中心", f3Desc: "不仅是在玩游戏，还能马上看到你的朋友在玩什么，进行聊天。",
    winTitle: "Windows 下载", winDesc: "Windows 10 / 11 兼容 • 安装程序文件 (.exe)", dlBtn: "下载",
    faqTitle: "常见 <span class='text-primary'>问题</span>", faq1_q: "该应用完全免费吗？", faq1_a: "是的，下载和使用产品商店客户端是完全免费的。",
    faq2_q: "支持哪些操作系统？", faq2_a: "目前支持 Windows 10/11。我们的 Linux 版本正在开发中。",     faq3_q: "我的帐户详细信息安全吗？", faq3_a: "绝对安全。"
  }
};

translations['TR'].loginUserEmail = "E-posta veya Kullanıcı Adı";
translations['EN'].loginUserEmail = "Email or Username";
translations['DE'].loginUserEmail = "E-Mail oder Benutzername";
translations['FR'].loginUserEmail = "E-mail ou Nom d'utilisateur";
translations['ES'].loginUserEmail = "Correo o Nombre de usuario";
translations['RU'].loginUserEmail = "Почта или Имя пользователя";
translations['ZH'].loginUserEmail = "电子邮件或用户名";

let currentLang = 'TR';
function changeLanguage(langKey) {
  currentLang = langKey;
  const t = translations[currentLang] || translations['EN'];
  const fb = translations['EN'];
  const trk = translations['TR'];
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    let text = t[key] || fb[key] || trk[key];
    if (text) el.innerHTML = text;
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    let text = t[key] || fb[key] || trk[key];
    if (text) el.setAttribute('placeholder', text);
  });
}

function toggleDropdown() {
  document.getElementById('langOptions').classList.toggle('show');
}
function selectLang(langKey, displayText) {
  document.getElementById('selectedLangText').textContent = displayText;
  document.getElementById('langOptions').classList.remove('show');
  changeLanguage(langKey);
}

// Close dropdown if clicked outside
document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('langDropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    document.getElementById('langOptions').classList.remove('show');
  }
});



/* ======== PASSWORD STRENGTH & FORM VALIDATION ======== */

function checkPasswordStrength(password) {
  const box = document.getElementById('passwordStrengthBox');
  const label = document.getElementById('strengthLabel');
  const suggestions = document.getElementById('strengthSuggestions');
  const bars = [document.getElementById('sBar1'), document.getElementById('sBar2'), document.getElementById('sBar3'), document.getElementById('sBar4')];
  
  if (!password || password.length === 0) {
    box.style.display = 'none';
    return;
  }
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
  
  let level, levelText, barCount;
  if (score <= 2) { level = 'weak'; levelText = '⚠️ Zayıf şifre'; barCount = 1; }
  else if (score <= 3) { level = 'medium'; levelText = '🟡 Orta güçlükte'; barCount = 2; }
  else if (score <= 4) { level = 'strong'; levelText = '✅ Güçlü şifre'; barCount = 3; }
  else { level = 'very-strong'; levelText = '🛡️ Çok güçlü!'; barCount = 4; }
  
  // Update bars
  bars.forEach((bar, i) => {
    bar.className = 'strength-bar';
    if (i < barCount) bar.classList.add('active', level);
  });
  
  // Update label
  label.className = 'strength-label ' + level;
  label.textContent = levelText;
  
  // Build suggestion chips
  const checks = [
    { met: hasUpper, icon: 'fa-font', text: 'Büyük harf (A-Z)' },
    { met: hasLower, icon: 'fa-font', text: 'Küçük harf (a-z)' },
    { met: hasNumber, icon: 'fa-hashtag', text: 'Rakam (0-9)' },
    { met: hasSpecial, icon: 'fa-asterisk', text: 'Özel karakter (!@#$)' },
    { met: isLong, icon: 'fa-ruler-horizontal', text: '8+ karakter' }
  ];
  
  // Only show unmet ones first, then met ones
  const unmet = checks.filter(c => !c.met);
  const met = checks.filter(c => c.met);
  const sorted = [...unmet, ...met];
  
  let html = '';
  if (unmet.length > 0 && score <= 3) {
    html += '<div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:4px; width:100%;">Bunları ekleyerek güçlendirebilirsiniz:</div>';
  }
  sorted.forEach(c => {
    const cls = c.met ? 'met' : 'unmet';
    const icon = c.met ? 'fa-check' : 'fa-plus';
    html += `<span class="strength-chip ${cls}"><i class="fas ${icon}"></i> ${c.text}</span>`;
  });
  suggestions.innerHTML = html;
}

// ===== FORM VALIDATION: Enable/Disable Buttons =====

function validateLoginForm() {
  const email = document.getElementById('loginEmail')?.value.trim();
  const pass = document.getElementById('loginPassword')?.value;
  const btn = document.getElementById('loginBtn');
  if (!btn) return;
  
  if (email && email.length > 0 && pass && pass.length > 0) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

function validateRegisterForm() {
  const username = document.getElementById('regUsername')?.value.trim();
  const email = document.getElementById('regEmail')?.value.trim();
  const pass = document.getElementById('regPassword')?.value;
  const pass2 = document.getElementById('regPassword2')?.value;
  const kvkk = document.getElementById('kvkkCheck')?.checked;
  const btn = document.getElementById('regBtn');
  if (!btn) return;
  
  if (username && username.length >= 3 && email && email.length > 0 && pass && pass.length >= 6 && pass2 && pass2.length > 0 && kvkk) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

// Attach listeners after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Login form listeners
  const loginEmail = document.getElementById('loginEmail');
  const loginPass = document.getElementById('loginPassword');
  if (loginEmail) loginEmail.addEventListener('input', validateLoginForm);
  if (loginPass) loginPass.addEventListener('input', validateLoginForm);
  
  // Register form listeners
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
});

/* ======== GOOGLE OAUTH ======== */
async function signInWithGoogle() {
  if (!sb) {
    showToast('Supabase bağlantısı kurulamadı.', true);
    return;
  }
  try {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
    // Supabase will redirect to Google's OAuth page automatically
  } catch (err) {
    showToast('Google giriş hatası: ' + (err.message || 'Bir hata oluştu.'), true);
  }
}


// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service worker registered.', reg))
      .catch((err) => console.log('Service worker not registered.', err));
  });
}
