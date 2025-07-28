Berikut versi README yang ringkas, rapih, dan mudah dipahami dari dokumen teori dan standar implementasi sistem pengiriman email yang idempoten:

---

# 📧 Idempotent Email Delivery System

Sistem ini memastikan email hanya dikirim **sekali saja** untuk setiap aksi unik, bahkan jika trigger dikirim berulang. Cocok untuk aplikasi berbasis notifikasi, approval, dan workflow digital.

---

## ⚙️ Prinsip Dasar Idempoten
Operasi dianggap **idempoten** jika hasilnya tetap sama walau dijalankan berkali-kali.

```ts
if (!hasBeenProcessed(uniqueKey)) {
  performOperation();
  markAsProcessed(uniqueKey);
}
```

---

## 🧩 Idempotency Key

Key unik untuk tiap email:

```ts
IdempotencyKey = Hash(EntityID + OperationType + RecipientID + Status + ContentHash)
```

Hash konten:

```ts
function hashString(str: string): string {
  if (!str) return 'no-content';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}
```

---

## 🏗️ Arsitektur

```text
Trigger 
  ↓ 
Generate Idempotency Key 
  ↓ 
Cek: Sudah Pernah Dikirim? 
  ↓           ↓
Tidak         Ya
↓             Stop
Antri Email
↓
Kirim
↓
Log Hasil
```

---

## 🧪 Implementasi

### ✅ Cek Email Sebelumnya

```ts
function hasEmailBeenSent(...) {
  const key = generateKey(...);
  return emailSentMap.has(key);
}
```

### 📝 Log Email Terkirim

```ts
function logEmailSent(...) {
  emailSentMap.set(key, {
    timestamp: Date.now(),
    success: true,
    content
  });
}
```

### 📬 Antrian & Retry

```ts
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 10000;

async function sendQueuedEmails() {
  ...
  if (failedEmails.length > 0) {
    emailQueue.push(...failedEmails);
    setTimeout(sendQueuedEmails, RETRY_DELAY_MS);
  }
}
```

---

## ✉️ Contoh Penggunaan

```ts
await sendNotificationEmail(
  123, 'user@email.com', 'approval', 'approved', 'Catatan penting'
);
```

---

## 🚀 Rekomendasi Penskalaan

| Mode | Tool | Catatan |
|------|------|---------|
| Single Instance | In-Memory (Map) | Tidak persisten |
| Multi Instance | Redis, Kafka, RabbitMQ | Lebih tahan banting |

---

## 📊 Monitoring

- **Email Delivery Rate**
- **Duplicate Prevention Rate**
- **Retry Success Rate**

---

## 🔁 Kasus Khusus

### 📦 Batch Besar
- Chunking
- Throttling
- Prioritization

### ✏️ Perubahan Minor
```ts
function isSignificantChange(oldC, newC) {
  return levenshteinDistance(oldC, newC) > THRESHOLD;
}
```

---

## 🧾 API

```ts
/**
 * Mengirim email idempoten
 */
function sendIdempotentEmail(
  entityId: number,
  recipientEmail: string,
  emailType: string,
  status: string,
  content?: string
): Promise<boolean>;
```

---

## ✅ Best Practices

- Gunakan Idempotency Key selalu
- Sertakan metadata lengkap
- Logging lengkap
- Retry robust
- Gunakan Redis untuk multi-instance

---

> Sistem ini membantu memastikan **email tidak ganda**, **reliable**, dan **skalabel** dalam proses notifikasi digital Anda.

--- 

