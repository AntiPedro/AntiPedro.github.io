# Ürün Store

Windows 10/11 için %100 ücretsiz oyun ve uygulama mağazası istemcisi. Hızlı indirme, otomatik güncelleme, kütüphane ve topluluk — tek uygulamada.

## Canlı Site

<https://antipedro.github.io/>

## Özellikler

- Hızlı ve güvenli indirme (GitHub Releases)
- Otomatik arka plan güncelleyici
- Kütüphane ve mağaza yönetimi
- 7 dil desteği (TR, EN, DE, FR, ES, RU, ZH)
- Discord topluluğu entegrasyonu
- PWA — telefonda ana ekrana eklenebilir
- Supabase ile güvenli hesap sistemi (kayıt, giriş, Google OAuth, KVKK)

## Dağıtım

GitHub Pages, `main` dalına push ile otomatik deploy olur (`.github/workflows/pages.yml`).

Supabase bağlantı bilgilerini secrets ile yönetmek istersen:

1. Repo → Settings → Secrets and variables → Actions
2. `SUPABASE_URL` ve `SUPABASE_ANON_KEY` secrets'larını ekle
3. Push sonrası deploy sırasında `scripts/build-config.js` `config.js` üretir

> Secrets yoksa repo'daki `config.js` kullanılır, deploy yine çalışır. Anon key tarayıcıda görünür olması normaldir — asıl koruma Supabase RLS'tir. `service_role` key'i asla public repo'ya yazmayın.

## Geliştirme

```bash
# Yerel test
python -m http.server 8000
# veya
npx serve .
```

## Lisans

Özel / tüm hakları saklıdır.