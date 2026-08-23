# music-visual-generator

Şarkı yükleyince mod/duygu verisine göre minimal, abstract bir klip üreten
tarayıcı tabanlı sistem. Winamp/MilkDrop ruhunda, nokta bulutu figürlerle
anlatı katmanı eklenmiş.

## Mimari

- **Ses analizi**: [Essentia.js](https://mtg.github.io/essentia.js/) — mood/tempo/energy, tamamen tarayıcıda, ücretsiz
- **Katman A (doku)**: [Butterchurn](https://github.com/jberg/butterchurn) — MilkDrop'un WebGL portu
- **Katman B (parçacık)**: Canvas 2D / Three.js ortografik — özgün öğeler (baloncuk, çizgi vb.)
- **Katman C (anlatı)**: Nokta bulutu figür animasyonu — Mixamo veya MediaPipe Pose kaynaklı iskelet verisi
- **Export**: `MediaRecorder` API — canvas + audio stream, tarayıcıda klip üretimi

Mapping detayları için → [`docs/mood-visual-mapping.md`](docs/mood-visual-mapping.md)

## Kullanım

```bash
cd music-visual-generator
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ altına production build
```

Ses dosyası yükle → analiz tamamlanınca oynatmayı başlat → "Klip olarak dışa
aktar" ile canvas + audio akışını `MediaRecorder` üzerinden `.webm` olarak
indir. Söz duygu tonu (opsiyonel) için kendi Anthropic API anahtarını gir;
anahtar yalnızca tarayıcının `localStorage`'ında tutulur.

**Not:** `mood_aggressive/relaxed/happy/sad/party` skorları şu an gerçek
Essentia MusiCNN modelleri yerine, Essentia'nın doğrudan hesapladığı
düşük seviye özelliklerden (energy, complexity, danceability, spectral
centroid) türetilen bir sezgisel yaklaşımla hesaplanıyor - gerçek modeller
şarkı başına onlarca MB ağırlık indirmeyi gerektirdiği için "ücretsiz/cüzi
maliyet" hedefiyle çelişiyor. Detay ve genişletme notu için
`src/audio-analysis/essentia-analysis.js` dosyasının başındaki yorum.

## Durum

- [x] Proje iskeleti (Vite + vanilla JS/three.js)
- [x] Essentia.js entegrasyonu (tempo, energy, complexity, danceability, spectral centroid gerçek; mood_* sezgisel türetme)
- [x] Preset kütüphanesi (6 preset, `src/preset-selector.js`)
- [x] Katman B parçacık motoru (Canvas 2D)
- [x] Katman C figür sistemi (Three.js ortografik nokta bulutu + sahne makinesi)
- [x] Export pipeline (MediaRecorder, canvas+audio birleştirme)
- [x] Kullanıcı arayüzü + üretim limiti sistemi (günlük export kotası + klip süre sınırı)
- [ ] Gerçek Mixamo/MediaPipe kaynaklı point-cloud figür verisi (şu an prosedürel yürüyüş iskeleti)
- [ ] Gerçek Essentia MusiCNN mood sınıflandırıcıları (opsiyonel iyileştirme)

## Maliyet notu

Tüm stack ücretsiz/açık kaynak. Ücretli olabilecek tek opsiyonel katman:
söz analizi için LLM API çağrısı (şarkı başına kuruşlar mertebesinde).
