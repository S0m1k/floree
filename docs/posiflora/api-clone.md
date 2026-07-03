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
| GET | `/api/v1/inventory-items` · `/{id}` | `filter[category]`, `page[...]` | номенклатура (товары/услуги) |
| GET | `/api/v1/warehouses` | `page[...]` | склады |
| GET | `/api/v1/vendors` · `/{id}` | `page[...]` | поставщики |
| GET | `/api/v1/{order-tags,recipe-tags,discount-reasons,cash-reasons,customer-preferences,customer-sources,order-sources,customer-celebrations,measures}` | `page[...]` | справочники (title/deleted/revision; у discount-reasons + `discountType`) |
| GET | `/api/v1/{packing-invoices,write-off-invoices,markdown-acts,sorting-acts,inventory-acts,movement-acts}` · `/{id}` | `filter[store]`, `page[...]` | складские документы; by-id включает позиции (`*-lines`) в `included` |

> Складские документы: общий заголовок (`date/docNo/amount/linesCount/status/posted/…`)
> + связь `lines`. Тип позиции = `<doc>-lines` (напр. `packing-invoice-lines`
> {qty, amount, cost, prevCost, costPrice, idExternal} rels {item, measure, invoice}).
> В списке `lines` пустой (без N+1), в by-id — заполнен и включён.

> Имена эндпоинтов, выясненные с живого API: номенклатура = `inventory-items`
> (закрывает вопрос «goods/nomenclature»), единицы = тип `measures`, источники
> сделок = `order-sources`, накладные на списание = `write-off-invoices`.

Формы выверены автотестом против эталона: атрибуты и связи `categories`,
`specifications`, `specification-with-variants`, `specification-variants`,
`specification-variant-prices`, `images` совпадают 1:1.

## Аппроксимации (уточнить по `api-map.md` / при наполнении данными)
- `revision` (оптимистичная блокировка) и `countPublicItems` пока 0 — добавить вычисление/колонку.
- `images`: поля `fileLogo/fileLogoRetina/fileBanner/globalImage` отдаются `null` (нет в модели).
- `createdBy` у спецификации — `null` (нет связи worker в модели).
- M2M `specifications.images[]` пока = `[logo]`; полноценную галерею добавить вместе со связью.

## Аутентификация (`/v1/sessions`, JWT + Redis)
- `POST /api/v1/sessions` — двойной режим:
  - **логин**: `{data:{type:sessions,attributes:{username,password}}}` → проверка `workers.login` + bcrypt-хэш `password_hash`;
  - **refresh**: `{...attributes:{refreshToken}}` → ротация (одноразовый refresh).
  - Ответ: `data.type=sessions` с `{accessToken, expireAt, refreshToken, refreshExpireAt}` (то, что читают фронт/бэк).
- `DELETE /api/v1/sessions` `{...refreshToken}` → logout (revoke), `204`.
- `GET /api/v1/sessions/current` — `Authorization: Bearer <jwt>` → текущий `workers` (расширение клона).
- Токены: access — stateless **HS256 JWT** (`sub`=worker.id, TTL `ACCESS_TOKEN_TTL_SECONDS`); refresh — непрозрачный, хранится в **Redis** (`REDIS_URL`; иначе in-memory для dev/тестов), ротация через атомарный `GETDEL`.
- Конфиг: `JWT_SECRET` (обязателен), `JWT_ALGORITHM`, TTL, `REDIS_URL`. Модель: `workers.password_hash` + индекс `login` (миграция 0004).
- Зависимость `app.deps.get_current_worker` (Bearer → активный Worker или 401).
- Проверено ASGI-тестом: логин/current/неверные креды/ротация refresh/одноразовость/logout — зелёные.

> Пока read-эндпоинты `/v1/*` **не** закрыты авторизацией — фронт клона ещё не
> переключён на нашу сессию (это делается на этапе cutover, Фаза 6). `get_current_worker`
> готов для навешивания на записи/чувствительные ручки.

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
- **Фаза 3** — наполнение БД (экспорт из Posiflora → импорт в наши таблицы), затем переключение фронта на наш `/v1` (и включение авторизации на всех ручках, cutover — Фаза 6).
- Обогащение orders/order-payments/документов реальными связями и полями при переносе данных (markdown/movement заголовки — без живого образца, по общему паттерну).
