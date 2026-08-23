# Mood → Görsel Mapping Spesifikasyonu

Bu doküman, ses/söz analizinden çıkan duygu-mod verisinin, görsel üretim
parametrelerine nasıl dönüştüğünü tanımlar. Amaç: her şarkı için tekrarlanabilir,
kod ile sürülen bir eşleme sistemi.

## 1. Girdi verisi — Mood/Audio Feature Seti

Essentia.js'in tarayıcıda çalışan pretrained modellerinden çıkan skorlar
(0.0–1.0 arası normalize edilmiş):

| Feature | Kaynak | Açıklama |
|---|---|---|
| `energy` | Essentia (loudness/dynamic complexity) | Genel enerji/yoğunluk |
| `tempo` | Essentia (BPM estimator) | Vuruş hızı, BPM olarak |
| `mood_aggressive` | Essentia TF.js modeli | Agresiflik skoru |
| `mood_relaxed` | Essentia TF.js modeli | Sakinlik skoru |
| `mood_happy` | Essentia TF.js modeli | Pozitiflik skoru |
| `mood_sad` | Essentia TF.js modeli | Melankoli skoru |
| `mood_party` | Essentia TF.js modeli | Dans edilebilirlik/parti enerjisi |
| `danceability` | Essentia | Ritmik düzenlilik |
| `spectral_centroid` | Essentia/Meyda | Tını parlaklığı (parlak/karanlık ses) |
| `complexity` | Essentia (dynamic complexity) | Ses dokusunun düzensizliği |
| `lyrics_valence` *(opsiyonel)* | LLM analizi | Söz içeriğinin duygu tonu (-1 negatif → +1 pozitif) |

> Not: `lyrics_valence` opsiyonel katmandır, kullanıcı söz yapıştırırsa devreye girer.
> Yoksa tamamen ses analizine dayalı çalışılır.

## 2. Çıktı parametreleri — 3 katmanlı görsel sistem

### Katman A — Butterchurn (arka plan dokusu)
| Parametre | Aralık | Kontrol eden feature |
|---|---|---|
| `presetCategory` | `calm` / `energetic` / `chaotic` / `dark` | `energy`, `mood_aggressive`, `mood_relaxed` |
| `blendDuration` | 2–15 sn | `tempo` (yüksek tempo → hızlı geçiş) |
| `cycleSpeed` | preset değişim sıklığı | `mood_party` |

### Katman B — Custom parçacık sistemi (özgün öğeler: baloncuk, çizgi, vb.)
| Parametre | Aralık | Kontrol eden feature |
|---|---|---|
| `particleDensity` | 50–800 adet | `energy` |
| `particleSpeed` | 0.2–4.0 (birim/sn) | `tempo`, `mood_aggressive` |
| `gravityDirection` | vektör (yukarı/aşağı/yanlara) | `mood_sad` (aşağı), `mood_happy` (yukarı) |
| `frictionSlope` | 0.0–1.0 (kayganlık) | `spectral_centroid` (parlak/deneysel ses → kaygan zemin) |
| `explosionThreshold` | 0.0–1.0 | `mood_aggressive`, `complexity` |
| `colorPalette` | preset paletlerden seçim | `mood_happy` vs `mood_sad`, `lyrics_valence` |
| `shapeType` | `circle` / `line` / `fragment` / `dot` | `complexity`, `danceability` |

### Katman C — Anlatı/sahne sistemi (nokta bulutu figür, "hikaye" katmanı)
| Sahne | Tetikleyici | Görsel davranış |
|---|---|---|
| `intro_chaos` | Şarkı başlangıcı, düşük enerji | Dağınık, amaçsız noktalar |
| `figure_emerging` | Enerji artışı (verse→pre-chorus) | Noktalar toplanmaya başlar, iskelet belirir |
| `figure_active` | Enerji zirvesi (chorus/drop) | Net yürüyen/koşan figür, yüksek parçacık yoğunluğu |
| `dissolve` | Enerji düşüşü (outro/bridge) | Figür dağılır, kaosa döner |

Sahne geçişleri, `energy` ve `tempo` sinyalindeki **ani değişim noktaları**
(onset/segment detection) ile tetiklenir — şarkı boyunca otomatik zaman çizelgesi
oluşturulur.

## 3. Örnek preset — "Kaygan Zemin" (deneysel/IDM tarzı için)

Senin verdiğin örnek (Aphex Twin tarzı → yokuş aşağı kayan/patlayan baloncuklar)
şu şekilde parametrelere dökülür:

```json
{
  "name": "kaygan_zemin",
  "triggerConditions": {
    "mood_aggressive": ">0.4",
    "danceability": "<0.4",
    "complexity": ">0.6"
  },
  "layerB": {
    "shapeType": "circle",
    "gravityDirection": "diagonal-down",
    "frictionSlope": 0.15,
    "particleSpeed": 2.5,
    "explosionThreshold": 0.5,
    "colorPalette": "cold_neon"
  }
}
```

## 4. Genel mapping mantığı (özet akış)

```
Ses dosyası
   → Essentia.js analiz (energy, tempo, mood_*, complexity)
   → (opsiyonel) LLM ile söz analizi (lyrics_valence)
   → Preset seçici (en yakın preset'i puanlama ile bulur)
   → Katman A/B/C parametreleri hesaplanır
   → Zaman çizelgesi (sahne geçişleri) oluşturulur
   → Render motoru (Butterchurn + Canvas/Three.js parçacık sistemi) çalıştırılır
   → MediaRecorder ile klip export
```

## 5. Sonraki adımlar

- [ ] Essentia.js entegrasyonu ve feature çıkarma pipeline'ı
- [ ] Preset kütüphanesi (en az 5-6 temel mood preset'i)
- [ ] Katman B parçacık motoru (Canvas 2D veya Three.js ortografik)
- [ ] Katman C figür/nokta bulutu sistemi (Mixamo/MediaPipe entegrasyonu)
- [ ] Sahne geçiş zamanlayıcısı (onset detection)
- [ ] Export sistemi (MediaRecorder + audio stream birleştirme)
