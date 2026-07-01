# API клона (Фаза 2) — Posiflora-совместимые `/v1`

Цель: отдавать те же JSON:API-структуры, что и Posiflora, чтобы фронтенд
переключился сменой базового URL без изменения обработки ответов.

- Слой: [backend/app/jsonapi.py](../../backend/app/jsonapi.py) (примитивы document/resource/relationships/included), [backend/app/serializers.py](../../backend/app/serializers.py) (сериализаторы каталога), [backend/app/routers/v1_catalog.py](../../backend/app/routers/v1_catalog.py) (эндпоинты).
- Эталоны сняты с живого API `floreii.posiflora.com/api/v1` (2026-07-01).

## Реализовано
| Метод | Путь | Параметры | Ответ |
|---|---|---|---|
| GET | `/api/v1/categories` | `filter[group]`, `page[size]` | `data[]` categories (с `path`/`pathIds` из дерева), `meta.total` |
| GET | `/api/v1/specifications` | `include=logo`, `filter[status]`, `filter[category]`, `page[number]`, `page[size]` | `data[]` + `included` (logo), `meta.page{number,size}` + `total` |
| GET | `/api/v1/specifications/{id}` | `include=...specVariants...` | `data` + `included` (logo, SWV, варианты, цены) |
| GET | `/api/v1/stores` · `/stores/{id}` | `page[...]` | `data[]`/`data` stores |
| GET | `/api/v1/customers` · `/customers/{id}` | `filter[phone]`, `page[...]` | `data[]`/`data` customers |
| GET | `/api/v1/bouquets` · `/bouquets/{id}` | `filter[store]`, `page[...]` | `data[]`/`data` bouquets |
| GET | `/api/v1/orders` · `/orders/{id}` | `filter[status]`, `page[...]` | `data[]`/`data` orders (`paymentsAmount` из подтверждённых платежей) |
| GET | `/api/v1/payments` | `filter[order]`, `page[...]` | `data[]` order-payments |

Формы выверены автотестом против эталона: атрибуты и связи `categories`,
`specifications`, `specification-with-variants`, `specification-variants`,
`specification-variant-prices`, `images` совпадают 1:1.

## Аппроксимации (уточнить по `api-map.md` / при наполнении данными)
- `revision` (оптимистичная блокировка) и `countPublicItems` пока 0 — добавить вычисление/колонку.
- `images`: поля `fileLogo/fileLogoRetina/fileBanner/globalImage` отдаются `null` (нет в модели).
- `createdBy` у спецификации — `null` (нет связи worker в модели).
- M2M `specifications.images[]` пока = `[logo]`; полноценную галерею добавить вместе со связью.

## Флоу заказа (ребилд, прод-паритет)
Заказ в Posiflora больше **не** создаётся при оформлении. `POST /api/orders`
только считает цену на сервере и сохраняет PENDING-заказ с полным набором
аргументов в `orders.order_payload`. Создание заказа в Posiflora и запись
платежа происходят **лениво в вебхуке** `POST /api/payments/webhook` по
`CONFIRMED`:
- идемпотентно — повторный вебхук по уже оплаченному заказу это no-op
  (заказ создаётся 1 раз, платёж записывается 1 раз);
- сверка суммы — если подтверждённая сумма ≠ серверному тоталу, заказ помечается
  `amount_mismatch` и не исполняется;
- fail-safe — если Posiflora недоступна, заказ остаётся `paid` (posiflora_id
  пуст для последующего ретрая).

Проверено ASGI-тестами: shape'ы orders/order-payments 1:1; флоу
deferred-create+idempotency и блокировка amount-mismatch — зелёные.

## Дальше
- `/v1/sessions` (аутентификация, JWT) — нужно решить хранение паролей сотрудников + секрет подписи; для полной замены вендора.
- Склад/справочники по тем же сериализаторам.
- Наполнение БД (Фаза 3: экспорт из Posiflora → импорт), затем переключение фронта на наш `/v1`.
- Обогащение orders/order-payments реальными связями (customer/store/source) и полями (fiscal/delivery) при переносе данных.
