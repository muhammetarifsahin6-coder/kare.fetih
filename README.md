# KareFetih — Sıra Tabanlı Strateji Oyunu (Android & Web)

KareFetih; zarla fetih hakkı kazanılan, Kural 5.1 (en az 2×2 kompakt blok) geometrisine dayanan, 2–4 oyunculu (Yapay Zekâ ve Aynı Telefonda Çok Oyunculu) sıra tabanlı strateji oyunudur.

Bu depo hem **Web (PWA)** hem de **Yerel Android Uygulaması (APK / AAB)** olarak derlenmeye hazır şekilde yapılandırılmıştır.

---

## 🚀 Yöntem 1: GitHub Üzerinden Hiçbir Program Kurmadan Otomatik APK Alma (En Kolay Yöntem)

Projeye `.github/workflows/android-apk.yml` iş akışı eklenmiştir. Bilgisayarınıza Android Studio veya Java kurmanıza gerek kalmadan doğrudan GitHub sunucularında APK üretebilirsiniz:

1. Bu klasördeki tüm dosyaları kendi GitHub deponuza (`main` veya `master` dalına) yükleyin (`git push`).
2. GitHub deponuzun üst menüsünden **Actions** sekmesine tıklayın.
3. Sol taraftan **"Android APK & AAB Derle (KareFetih)"** iş akışını seçin (otomatik başlamadıysa sağdaki **Run workflow** butonuna basın).
4. İşlem (~2-3 dakika) tamamlandığında yeşil onay işaretli çalışmaya tıklayın ve en alttaki **Artifacts** bölümünden:
   - Telefonunuza doğrudan kurmak için: **`KareFetih-Android-Debug-APK`** (`app-debug.apk`)
   - Google Play Console'a yüklemek için: **`KareFetih-PlayStore-Release-AAB`** (`app-release.aab`)
   dosyasını indirin!

---

## 💻 Yöntem 2: Bilgisayarınızda (Android Studio ile) APK Üretme

1. **Bağımlılıkları Kurun:**
   ```bash
   npm install --legacy-peer-deps
   ```
2. **Web Derlemesini Alıp Android Klasörüne Aktarın:**
   ```bash
   npm run android:sync
   ```
   *(Bu komut `vite build` çalıştırır ve oluşan `dist/` dosyalarını otomatik olarak `android/app/src/main/assets/public/` içine kopyalar.)*
3. **Android Studio'da Açın:**
   - Android Studio'yu açın -> **Open** seçeneğine tıklayın ve proje içindeki **`android`** klasörünü seçin.
   - Gradle senkronizasyonu bittiğinde üst menüden **Build > Build Bundle(s) / APK(s) > Build APK(s)** yolunu izleyin.
   - Oluşan APK dosyası: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📱 Yöntem 3: PWABuilder veya TWA ile Paketleme

Oyunu GitHub Pages, Vercel veya Netlify üzerinde yayınladıktan sonra:
1. [PWABuilder.com](https://www.pwabuilder.com/) adresine yayınladığınız URL'yi girin.
2. **Package for Stores -> Android** seçeneğiyle imzalı APK ve Google Play AAB dosyasını indirin.

---

## 🛠️ Yapılan Android Uyumluluk Düzenlemeleri

- **`vite.config.ts`**: Android WebView (`file://` ve `https://appassets.androidplatform.net`) uyumu için `base: './'`, tam ekran (`fullscreen`) manifest ve `192x192` / `512x512` PNG ikon tanımları eklendi.
- **`android/` Yerel Projesi**:
  - `MainActivity.java`: `WebViewAssetLoader` ile sunucusuz yerel asset yükleme, tam ekran **Immersive Sticky Mode** (durum ve gezinme çubuklarını gizleme), **Android donanım Geri tuşu** ile maç içi çıkış menüsünü açma ve JavaScript köprüsü (`window.KareFetihNative.setOrientation`) üzerinden maç başladığında **otomatik yatay (landscape)**, menüye dönüldüğünde **dikey (portrait)** ekran döndürme desteği eklendi.
  - Tüm `mipmap-mdpi` .. `mipmap-xxxhdpi` uygulama ikonları (`ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`) ve açılış ekranı (`drawable/splash.png`) üretildi.
- **Sunucusuz (Çevrimdışı) Çalışma**: `BioStrategyModal.tsx` içindeki taktik danışmanı ve AlphaFold analizleri Android APK içinde Express sunucusuna ihtiyaç duymadan doğrudan çalışacak şekilde güncellendi.


## GitHub Actions ile APK üretme (düzeltilmiş kurulum)

Bu depoda APK derlemesini başlatan iş akışı `.github/workflows/android-apk.yml` dosyasıdır.

1. Bu ZIP'i bilgisayarınıza çıkarın.
2. GitHub'da KareFetih deposunu açın.
3. **Add file > Upload files** seçeneğine girip ZIP'i değil, ZIP'in içindeki dosya ve klasörleri yükleyin. En kolay yol: depodaki dosyaları bu klasörün içeriğiyle değiştirin; `.github` klasörünün gizli/normal klasör olarak yüklendiğini kontrol edin.
4. Değişiklikleri `main` dalına commit edin.
5. Depoda **Actions** sekmesini açın, **KareFetih Android APK** iş akışını seçin ve **Run workflow** düğmesine basın. İlk çalıştırma için GitHub deposunda Actions kullanımının etkin olması gerekir.
6. İşlem tamamlanınca yeşil başarılı çalışmaya girin. **Artifacts** bölümünden `KareFetih-Android-Debug-APK` dosyasını indirin. ZIP içindeki `app-debug.apk` dosyasını telefona aktararak kurabilirsiniz.

Not: Bu iş akışı imzasız debug APK üretir; kişisel test/kurulum içindir. Google Play için imzalı release AAB ayrıca yapılandırılmalıdır.
