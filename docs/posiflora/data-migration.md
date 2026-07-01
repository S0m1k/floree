# Миграция данных (Фаза 3) — импорт из Posiflora

Экспорт боевых данных из Posiflora JSON:API → импорт (upsert) в наши таблицы.

- Трансформации (чистые, тестируемые): [backend/app/etl/transforms.py](../../backend/app/etl/transforms.py) — Posiflora-ресурс → kwargs модели.
- Раннер: [backend/app/etl/posiflora_import.py](../../backend/app/etl/posiflora_import.py) — fetch (пагинация) + `merge` (upsert by id) в FK-безопасном порядке.

## Запуск (на сервере, нужны креды Posiflora + DATABASE_URL)
```bash
cd backend && python -m app.etl.posiflora_import
```
Идемпотентно — повторный прогон обновляет строки, не плодит дубли.

## Что импортируется
| Порядок | Сущность | Источник | Примечания |
|---|---|---|---|
| 1 | stores | `/v1/stores` | |
| 2 | categories | `/v1/categories` | сортировка родители→дети (FK `parent_id`) |
| 3 | measures, images, items | `/v1/inventory-items?include=measure,logo,category` | measures/images — только из includes (своих коллекций нет / 404) |
| 4 | vendors | `/v1/vendors` | |
| 5 | specifications + граф | `/v1/specifications` + деталь каждой | SWV/цены берутся из детали спецификации (коллекция SWV не отдаёт ни parent, ни цены) |
| 6 | customers | `/v1/customers` | имя=`title`, бонусы=`currentPoints` |

## Проверено (ASGI/DB, temp venv)
Раннер с замоканным `posiflora_request` → импорт в sqlite: FK графа рецептов
(spec→swv→price, item→measure/category), идемпотентность (повторный прогон —
те же счётчики), read round-trip (`/v1/specifications/{id}` отдаёт импортированную цену). 19/19 ✅

## Отложено (следующий заход)
- `bouquets` (витрина), `orders` + `order-payments`, складские документы — транзакционные/объёмные; заказы к тому же лягут в обогащённую модель при cutover.
- Справочники (tags/reasons/sources/preferences/celebrations) — при необходимости, тем же паттерном.
- После импорта: переключение фронта на наш `/v1` + включение авторизации (Фаза 6).
