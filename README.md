# Floree — Интернет-магазин цветов

Онлайн-витрина цветочного магазина **Floree** (Санкт-Петербург, Полтавский проезд, д. 2).

Сайт показывает букеты с витрины Posiflora в реальном времени, принимает заказы и проводит оплату через T-Bank.

---

## Архитектура

```
┌─────────────────────┐        ┌──────────────────────┐
│   Next.js 14        │  HTTP  │   FastAPI (Python)    │
│   (Фронтенд)        │◄──────►│   (Бэкенд)            │
│   :3000             │        │   :8000               │
└─────────────────────┘        └──────────┬───────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                   Posiflora API    T-Bank API      PostgreSQL
```

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Zustand (корзина)
- **Backend**: FastAPI (Python), SQLAlchemy async, asyncpg
- **БД**: PostgreSQL (заказы, платежи)
- **Платежи**: T-Bank эквайринг (`/v2/Init` → webhook → запись в Posiflora)
- **CRM**: Posiflora — синхронизация заказов и платежей

---

## Быстрый старт

### Требования
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+

---

### 1. Клонировать репозиторий

```bash
git clone https://github.com/S0m1k/floree.git
cd floree
```

---

### 2. Бэкенд (FastAPI)

```bash
cd backend

# Создать виртуальное окружение
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

# Установить зависимости
pip install -r requirements.txt

# Создать и заполнить .env
cp .env.example .env
```

Заполнить `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/floree
POSIFLORA_BASE_URL=https://floreii.posiflora.com/api
POSIFLORA_USERNAME=Somova
POSIFLORA_PASSWORD=Somova2025
POSIFLORA_STORE_ID=04797ede-f160-408a-b54e-96b4cd7282c3
POSIFLORA_SOURCE_ID=f128f295-5f2a-41b5-b63d-e6e1d6dbd4d5
TBANK_TERMINAL_KEY=ваш_terminal_key
TBANK_SECRET_KEY=ваш_secret_key
TBANK_API_URL=https://securepay.tinkoff.ru/v2
FRONTEND_URL=http://localhost:3000
```

```bash
# Создать базу данных PostgreSQL
createdb floree

# Запустить сервер (таблицы создадутся автоматически)
uvicorn main:app --reload --port 8000
```

Документация API: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 3. Фронтенд (Next.js)

```bash
# из корня проекта
npm install

# .env.local уже создан, проверить NEXT_PUBLIC_API_URL
# NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
```

Сайт: [http://localhost:3000](http://localhost:3000)

---

## Структура проекта

```
floree/
├── src/                          # Next.js фронтенд
│   ├── app/
│   │   ├── page.tsx              # Главная (витрина)
│   │   ├── catalog/page.tsx      # Витрина (все букеты)
│   │   ├── bouquet/[id]/         # Страница букета
│   │   ├── checkout/             # Оформление заказа
│   │   │   ├── page.tsx
│   │   │   ├── success/page.tsx  # После успешной оплаты
│   │   │   └── fail/page.tsx     # После неудачной оплаты
│   │   ├── privacy/page.tsx      # Политика конфиденциальности
│   │   ├── cookies/page.tsx      # Политика cookie
│   │   └── offer/page.tsx        # Публичная оферта
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── BouquetCard.tsx
│   │   ├── CartDrawer.tsx
│   │   └── AddToCartButton.tsx
│   └── lib/
│       └── cart.ts               # Zustand store (localStorage)
│
└── backend/                      # FastAPI бэкенд
    ├── main.py                   # Точка входа
    ├── requirements.txt
    ├── .env.example
    └── app/
        ├── config.py             # Настройки из .env
        ├── database.py           # Async SQLAlchemy
        ├── models.py             # Order, Payment (ORM)
        ├── schemas.py            # Pydantic схемы
        ├── routers/
        │   ├── bouquets.py       # GET /bouquets, /bouquets/{id}
        │   ├── orders.py         # POST /orders, GET /orders/{id}
        │   └── payments.py       # POST /payments/init, /payments/webhook
        └── services/
            ├── posiflora.py      # Posiflora API клиент (auth + requests)
            └── tbank.py          # T-Bank Init + webhook verify
```

---

## Флоу оплаты

```
Клиент заполняет форму
        ↓
POST /orders  →  создаётся заказ в Posiflora + запись в PostgreSQL
        ↓
POST /payments/init  →  T-Bank Init  →  PaymentURL
        ↓
Редирект на страницу T-Bank
        ↓
Клиент платит
        ↓
T-Bank → POST /payments/webhook  →  verify token
        ↓ (статус CONFIRMED)
Обновить order.status = "paid"
POST /v1/orders/{id}/payments в Posiflora  →  фиксируем оплату в CRM
        ↓
Редирект на /checkout/success
```

---

## T-Bank — настройка webhook

В личном кабинете T-Bank указать URL уведомлений:
```
https://ваш-домен.ru/payments/webhook
```

Метод: POST, формат: JSON или form-data.

---

## Деплой на VPS

### Бэкенд (systemd)

```ini
# /etc/systemd/system/floree-api.service
[Unit]
Description=Floree FastAPI
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/var/www/floree/backend
ExecStart=/var/www/floree/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable floree-api
systemctl start floree-api
```

### Фронтенд (PM2)

```bash
npm run build
pm2 start npm --name floree-frontend -- start
```

### Nginx (reverse proxy)

```nginx
server {
    server_name floree.ru www.floree.ru;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api/ {
        proxy_pass http://localhost:8000/;
    }
}
```

> При деплое установить `NEXT_PUBLIC_API_URL=https://floree.ru/api` и `FRONTEND_URL=https://floree.ru`

---

## Переменные окружения

| Переменная | Где | Описание |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `.env.local` | URL Python бэкенда |
| `POSIFLORA_BASE_URL` | `backend/.env` | Base URL Posiflora API |
| `POSIFLORA_USERNAME` | `backend/.env` | Логин Posiflora |
| `POSIFLORA_PASSWORD` | `backend/.env` | Пароль Posiflora |
| `POSIFLORA_STORE_ID` | `backend/.env` | ID магазина |
| `POSIFLORA_SOURCE_ID` | `backend/.env` | ID источника «Сайт» |
| `TBANK_TERMINAL_KEY` | `backend/.env` | TerminalKey T-Bank |
| `TBANK_SECRET_KEY` | `backend/.env` | SecretKey T-Bank |
| `DATABASE_URL` | `backend/.env` | PostgreSQL connection string |
| `FRONTEND_URL` | `backend/.env` | URL фронтенда (для redirect после оплаты) |

---

## Правовые страницы

- `/privacy` — Политика конфиденциальности
- `/cookies` — Политика cookie
- `/offer` — Публичная оферта

---

*Разработано для Floree · Санкт-Петербург*
