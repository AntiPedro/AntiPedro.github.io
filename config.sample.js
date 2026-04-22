/**
 * Önerilen: .env kullan (repoda yok).
 * 1) .env.example → .env kopyala, SUPABASE_URL ve SUPABASE_ANON_KEY doldur.
 * 2) npm run build  →  köke config.js üretir (gitignore’da).
 *
 * Elle de kullanılabilir: bu dosyayı config.js yapıp doldur (eski yöntem).
 * service_role asla koyma.
 */
window.__URUNSTORE_CFG = {
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_PUBLIC_KEY'
};
