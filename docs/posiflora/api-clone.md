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

Формы выверены автотестом против эталона: атрибуты и связи `categories`,
`specifications`, `specification-with-variants`, `specification-variants`,
`specification-variant-prices`, `images` совпадают 1:1.

## Аппроксимации (уточнить по `api-map.md` / при наполнении данными)
- `revision` (оптимистичная блокировка) и `countPublicItems` пока 0 — добавить вычисление/колонку.
- `images`: поля `fileLogo/fileLogoRetina/fileBanner/globalImage` отдаются `null` (нет в модели).
- `createdBy` у спецификации — `null` (нет связи worker в модели).
- M2M `specifications.images[]` пока = `[logo]`; полноценную галерею добавить вместе со связью.

## Дальше
- `/v1/sessions` (аутентификация, JWT) — нужно решить хранение паролей сотрудников + секрет подписи; для полной замены вендора.
- `orders` (богатая сущность) + `order-payments` (эндпоинт `/v1/payments`, тип `order-payments`: paymentType/date/amount/bonusAmount/description/posted/prepayment/fiscalized + rels method→payment-methods, shift, order) — вместе с ребилдом флоу «заказ только после CONFIRMED».
- Склад/справочники по тем же сериализаторам.
- Наполнение БД (Фаза 3: экспорт из Posiflora → импорт), затем переключение фронта на наш `/v1`.
