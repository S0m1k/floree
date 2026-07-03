# Модель данных клона (Фаза 1)

Цель: собственные таблицы, повторяющие сущности Posiflora JSON:API 1:1, чтобы
фронтенд продолжил получать те же структуры, когда Фаза 2 начнёт отдавать их из
нашей БД вместо проксирования вендора.

- Модели (по доменам): [catalog_models.py](../../backend/app/catalog_models.py), [inventory_models.py](../../backend/app/inventory_models.py), [staff_models.py](../../backend/app/staff_models.py), [loyalty_models.py](../../backend/app/loyalty_models.py), [dictionary_models.py](../../backend/app/dictionary_models.py) + [models.py](../../backend/app/models.py) (orders/payments, подключает остальные к метаданным).
- Миграции: [0001_initial_core_domain.py](../../backend/alembic/versions/0001_initial_core_domain.py) (orders/payments + ядро каталога), [0002_phase1_domain.py](../../backend/alembic/versions/0002_phase1_domain.py) (склад/сотрудники/лояльность/справочники). `alembic upgrade head` поднимает все 46 таблиц.
- Имена колонок в БД — snake_case; в API (Фаза 2) маппятся обратно в camelCase JSON:API.
- Проверено: `configure_mappers()` + `create_all` (sqlite) + полный круг миграций upgrade→downgrade→upgrade, повторный autogenerate пуст (нет дрейфа).

## Реализовано в Фазе 1 (ядро каталога + клиенты)

| JSON:API type | Таблица | Назначение |
|---|---|---|
| `stores` | `stores` | торговые точки |
| `images` | `images` | изображения (file/fileSmall/fileMedium/fileShop) |
| `categories` | `categories` | дерево категорий (self-FK `parent_id`, `group_id`; `9`=Рецепты) |
| `specifications` | `specifications` | рецепты (title, public, min/max price, FK category/logo) |
| `specification-variants` | `specification_variants` | вариант-размер (title «9 штук») |
| `specification-with-variants` | `specification_with_variants` | связка рецепт↔вариант (SWV; is_default, status) |
| `specification-variant-prices` | `specification_variant_prices` | **авторитетная цена** варианта (`price_value`) |
| `bouquets` | `bouquets` | собранные букеты на витрине (amount/saleAmount, FK store/SWV) |
| `customers` | `customers` | клиенты (phone, bonus_balance, birthday, source) |
| `orders` | `orders` | заказы (текущая схема; будет обогащена при ребилде флоу) |
| `payments` | `payments` | платежи T-Bank |

> Цена заказа считается только по `specification_variant_prices.price_value` —
> см. фикс анти-подмены цены в [admin-map.md](admin-map.md) §2.2.1 и роутере заказов.

## Реализовано в Фазе 1 (склад / сотрудники / лояльность / справочники)

| Домен | Таблицы |
|---|---|
| Склад | `items` (номенклатура), `warehouses`, `stock_balances`, `vendors` |
| Складские документы | `packing_invoices`(+items), `writeoff_invoices`(+items), `markdown_acts`(+items), `sorting_acts`(+items), `inventory_acts`(+items), `movement_acts`(+items) |
| Сотрудники | `roles`, `workers`, `devices`, `shifts`, `cash_operations`, `telegram_bot_users` |
| Лояльность | `bonus_groups`, `discount_groups`, `bonus_cards`, `customer_events` |
| Справочники | `order_tags`, `recipe_tags`, `discount_reasons`, `cash_reasons`, `customer_preferences`, `customer_sources`, `customer_deal_sources`, `customer_celebrations`, `units_of_measure` |

## Отложено (последующие фазы)
- Маркетинговые рассылки: SMS (`notifications`), Push (`wallet-notifications`), авто-оповещения по статусам (`order-notifications`).
- Обогащение `orders`/`order_items` под полный флоу (создание заказа только после CONFIRMED оплаты, идемпотентность) — см. [[payment-price-vuln]].
- Привязки many-to-many (например, `specifications`↔`images`, состав рецепта из `items`) — добавить при реализации соответствующих экранов.

## Предусловие для Фазы 2
Поднять в репо `docs/posiflora/api-map.md` (сейчас только на сервере
`root@147.45.212.254:/var/www/floree/`) — там точные поля/фильтры эндпоинтов для
1:1 совместимости ответов.
