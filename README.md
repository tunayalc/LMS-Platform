# LMS-Platform

Çok istemcili ve servis odaklı bir öğrenme yönetim sistemi mimarisi

## Genel Bakış

`LMS-Platform`, API, web, mobil, masaüstü ve yardımcı servisleri aynı monorepo içinde birleştiren kapsamlı bir öğrenme yönetim sistemi çalışması. Bu proje, tek ekranlı bir eğitim uygulamasından öte; ders yönetimi, sınav sistemi, entegrasyonlar, çoklu istemci desteği ve yardımcı servisler üzerinden daha büyük ölçekli bir ürün düşüncesini modellemeyi amaçlıyor.

## Ürün Kapsamı

| Modül | Kapsam |
| --- | --- |
| Kimlik ve Kullanıcı Yönetimi | çok rollü kullanıcı yapısı, auth akışları |
| Ders ve İçerik Yönetimi | dersler, modüller, içerik modülleri |
| Sınav Sistemi | sınavlar, soru tipleri, soru bankası, grading |
| Takip ve Değerlendirme | progress, gradebook, rubrikler, notlandırma |
| Entegrasyonlar | LTI, xAPI, BigBlueButton, Mattermost, Microsoft 365 |
| Yardımcı Servisler | OMR, proctoring, push, sync, notes |
| İstemciler | web, mobile, desktop |

## Monorepo Mimarisi

```text
LMS-Platform/
|-- apps/
|   |-- api/
|   |-- desktop/
|   |-- mobile/
|   `-- web/
|-- packages/
|   `-- shared/
|-- services/
|   `-- omr-python/
|-- docs/
|-- scripts/
|-- docker/
|-- docker-compose.yml
`-- README.md
```

## Bileşenler

### `apps/api`

Platformun ana backend katmanı. Kod yapısı, LMS domain'inin büyük kısmını taşıyor.

Bu alanda doğrudan görülen başlıklar:

- auth ve kimlik doğrulama
- kullanıcı yönetimi
- ders, modül ve içerik yönetimi
- sınav ve soru bankası
- gradebook ve grading
- progress takibi
- rubrik ve template yapıları
- notes
- OMR ve proctoring entegrasyonları
- sync ve push servisleri

### `apps/web`

Next.js tabanlı web istemcisi. LMS deneyiminin web yüzünü oluşturuyor ve öğrenci / eğitmen / yönetici akışlarını taşıyan arayüz katmanı görevini üstleniyor.

### `apps/mobile`

Expo / React Native tabanlı mobil uygulama. LMS yapısının mobil cihazlarda kullanılabilir sürümünü temsil ediyor.

### `apps/desktop`

Electron tabanlı masaüstü istemcisi. Özellikle lokal çalışma senaryoları ve masaüstü odaklı kullanım ihtiyaçları için tasarlanmış istemci katmanı.

### `packages/shared`

Web, mobil ve masaüstü tarafında tekrar kullanılabilen ortak tipler, istemci yardımcıları ve konfigürasyon mantığını taşıyan paket.

### `services/omr-python`

Optik form okuma iş yükünü ana backend'den ayıran Python tabanlı servis. LMS içinde görüntü işleme odaklı yardımcı servis sınırını temsil ediyor.

## OMR Bileşeni

OMR tarafı bu proje içinde ayrı bir ürün gibi değil, doğrudan LMS'in sınav ve değerlendirme akışını destekleyen yardımcı servislerinden biri olarak konumlanıyor.

Kod tarafında görülen ana yapı:

- `services/omr-python/app/main.py` FastAPI giriş noktasını taşıyor
- `/health` ucu servis sağlık bilgisini dönüyor
- `/version` ucu servis versiyon bilgisini dönüyor
- `/scan` ucu yüklenen optik form görselini işleyip sonucu dönüyor

`/scan` akışında yalnızca dosya yükleme değil, şu parametreler de destekleniyor:

- `answerKey`
- `threshold`
- `xOffset`
- `yOffset`
- `debug`
- `smartAlign`
- `skipWarp`
- `manualCorners`

Bu yaklaşım, OMR bileşeninin sabit bir görsel işleyici olmaktan çok, farklı tarama senaryolarına uyarlanabilen parametrik bir servis olarak düşünüldüğünü gösteriyor.

Teknik olarak OMR tarafı:

- Python
- FastAPI
- OpenCV
- NumPy

ekseninde konumlanıyor ve LMS içindeki kağıt / optik değerlendirme senaryolarına destek veriyor.

## Teknoloji Yığını

### Backend

- Node.js
- Express
- TypeScript
- PostgreSQL
- Redis

### Frontend / Clients

- Next.js
- React
- Expo / React Native
- Electron

### Yardımcı Servisler ve Araçlar

- Python
- FastAPI
- Docker
- çoklu entegrasyon servisleri

## Teknik Olarak Öne Çıkan Yönler

- monorepo organizasyonu
- çok istemcili ürün yaklaşımı
- backend ile yardımcı servislerin ayrıştırılması
- LMS domain'ine özgü modül yoğunluğu
- entegrasyon odaklı servis tasarımı
- shared package üzerinden ortak kontrat kullanımı

## Dokümantasyon ve Yardımcı Alanlar

Repo içinde ayrıca şu destek alanları bulunuyor:

- `docs/` altında dağıtım, entegrasyon ve performans notları
- `scripts/` altında geliştirme ve smoke akışları
- `docker/` ve compose dosyaları altında container bazlı çalışma senaryoları
