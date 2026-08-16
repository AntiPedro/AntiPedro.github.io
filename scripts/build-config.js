/**
 * GitHub Actions dağıtımında secrets'tan köke config.js üretir.
 * Kullanım: SUPABASE_URL ve SUPABASE_ANON_KEY ortam değişkenleriyle çalıştırın:
 *   node scripts/build-config.js
 */
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('Eksik çevre değişkeni: SUPABASE_URL ve SUPABASE_ANON_KEY gerekli.');
  process.exit(1);
}

const content = `/** GitHub Actions tarafından üretildi. Elle düzenlemeyin. */
window.__URUNSTORE_CFG = {
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)}
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'config.js'), content, 'utf8');
console.log('config.js üretildi.');