# Deploy lên Railway

## Cấu trúc: 2 services riêng biệt

```
Railway Project
├── Service: xlmpredict-backend  (thư mục: XLMPredict/server)
└── Service: xlmpredict-frontend (thư mục: XLMPredict)
```

---

## Bước 1: Deploy Backend trước

1. Vào [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Chọn repo, chọn **Root Directory** = `XLMPredict/server`
3. Railway tự detect Node.js và chạy `npm install && npm run build && npm run start`
4. Thêm **Environment Variables**:

```
DATABASE_URL=postgresql://...  (copy từ Neon hoặc Railway Postgres)
ADMIN_SECRET_KEY=SDBZLQ3AVSJNUW62IUD3LDRVFPWN3AYTKHN7NNCEVMYEK4NIC2N6O3WL
ADMIN_PUBLIC_KEY=GCCSYOOWH3QQAGTMOF4OP72EKHPMJLP6I7O7MGW5LEDYAOP52DQNYY47
CONTRACT_ID=CABGLSMDD3IEKP6NS6O5GFI7KEQIGFPCRSODWRWE6Q7I7FC2FS652R2Z
RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
PORT=3001
ALLOWED_ORIGINS=https://xlmpredict-frontend.railway.app
CRON_INTERVAL_MS=60000
PRICE_FETCH_INTERVAL_MS=30000
```

5. Sau khi deploy xong, copy URL backend (vd: `https://xlmpredict-backend.up.railway.app`)

---

## Bước 2: Deploy Frontend

1. New Service trong cùng project → Deploy from GitHub repo
2. Chọn **Root Directory** = `XLMPredict`
3. Thêm **Environment Variables**:

```
VITE_API_URL=https://xlmpredict-backend.up.railway.app
```

4. Railway sẽ chạy `npm install && npm run build` rồi `npm run preview`

---

## Bước 3: Update ALLOWED_ORIGINS

Sau khi frontend deploy xong, copy URL frontend và update biến `ALLOWED_ORIGINS` trong backend service:

```
ALLOWED_ORIGINS=https://xlmpredict-frontend.up.railway.app
```

---

## Kiểm tra

- Backend health: `https://your-backend.railway.app/api/health`
- Frontend: `https://your-frontend.railway.app`
