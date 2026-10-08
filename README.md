# Masa Atölyesi

Masadaki eşyaları ve North Bayou F80 gazlı monitör kollarını 3B ortamda düzenlemek için Three.js simülatörü. Monitörü istediğin yere sürüklersin; kolun omuz, dirsek, kaldırma, baş, eğim ve döndürme açılarını simülatör ters kinematikle hesaplar. Kolun ulaşamadığı yerler, çakışmalar (duvar, masa, diğer monitör, kollar, eşyalar) ve göz noktasına göre ergonomi anında görünür.

## Çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda `http://127.0.0.1:5197`. Üretim derlemesi: `npm run build`, önizleme: `npm run preview` (4197).

Doğrulama: `npm run check` (tsc + eslint + vitest + vite build).

## Kontroller

| Girdi | Etki |
| --- | --- |
| Monitörü sürükle | Monitörü kameraya göre sağa-sola / yukarı-aşağı taşır, açıları ters kinematik bulur |
| Shift + sürükle | Monitörü öne-arkaya taşır |
| Kol tabanını sürükle | Kelepçeyi masa üstünde taşır |
| Nesneyi sürükle | Masada taşır; üstündeki nesneler (kasa üstündeki modem) birlikte gelir |
| Oklar, PageUp/PageDown | Seçiliyi 10 mm taşır (Shift: 1 mm) |
| Q / E | Nesneyi 15° döndürür; monitörde ekranın bakış yönünü VESA noktası sabit kalarak çevirir (Shift: 1°) |
| R | Nesneyi 90° çevirir (Shift: ters yön); monitörü yatay ↔ dikey yapar |
| Z / X | Monitörü aşağı / yukarı eğer (5°, Shift: 1°) |
| 0 | Yönü sıfırlar; monitör düz karşıya bakar, eğim ve döndürme sıfırlanır |
| 1–5 | Kamera: perspektif, ön, üst, yan, göz |
| F | Seçime odaklanır |
| Ctrl+Z / Ctrl+Y | Geri al / yinele |
| Esc | Seçimi kaldırır |
| Sol / sağ tuş, tekerlek | Döndür / kaydır / yakınlaş |

Panelde her eklemin kaydırıcısı, derece kutusu ve sınırlarını gösteren kadranı vardır. "VESA eklemi · hedef konum" alanına mm yazıp Enter'a basınca kol o noktaya çözülür.

## Model

Birimler mm ve derece. Orijin masa üstünün merkezi; +X sağ, +Y yukarı, +Z kullanıcıya doğru.

F80 zinciri: kelepçe → kolon → omuz (yatay) → alt kol → dirsek (yatay) → gazlı ön kol (kaldırma açısı; paralelkenar başı yatay tutar) → baş dönüşü → eğim → döndürme → VESA. Hesap [src/model/kinematics.ts](src/model/kinematics.ts) içinde saf TypeScript'tir; 3B hiyerarşi aynı zinciri kurar.

Varsayılan ölçüler ve sınırlar (paneldeki "Kol ölçüleri ve eklem sınırları" bölümünden kendi kolunla düzelt):

| Değer | Varsayılan | Kaynak |
| --- | --- | --- |
| Alt kol / gazlı ön kol / başlık | 225 / 255 / 55 mm | ~530 mm toplam uzanım (satıcı bilgisi) |
| Kaldırma | −25° … +40° | ~260 mm yükseklik aralığından türetildi |
| Baş dönüşü | ±90° | üretici |
| Eğim | −30° … +85° | üretici |
| Döndürme | ±180° | üretici (360°) |
| Taşıma | 2–9 kg | üretici |

Başlangıç düzeni fotoğraftaki masadır: 160×80 cm masa, iki 27" monitör, iki F80. Üst monitörün yüksekliği standart kolonla erişilemediği için üst kolun kolonu 500 mm varsayıldı; gerçek montajına göre "Montaj → Kolon" değerini değiştir.

Ergonomi eşikleri genel ofis önerileridir: göz mesafesi 50–100 cm, ekran merkezi göz hizasının 5° üstü ile 35° altı arası, ekran sapması 15° altı.

## Kayıt

Düzen her değişiklikte tarayıcıya otomatik kaydedilir. "Düzen" sekmesinden adlı düzenler saklanır, JSON olarak dışa/içe aktarılır.
