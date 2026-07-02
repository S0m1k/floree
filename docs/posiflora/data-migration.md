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
| 6 | bouquets | `/v1/bouquets` | FK `specWithVar`; неизвестный SWV → `NULL` (без висячего FK) |
| 7 | customers | `/v1/customers` | имя=`title`, бонусы=`currentPoints` |
| 8 | orders | `/v1/orders` | в тонкую модель Order: contact/phone/адрес из `delivery*`, `posiflora_id`=id; заказ↔букеты на чтении не связаны → `bouquet_ids="[]"` |
| 9 | order-payments | `/v1/payments` | FK `order`; платежи к неимпортированным заказам пропускаются |
| 10 | справочники | `/v1/{order-tags,recipe-tags,discount-reasons,cash-reasons,customer-preferences,customer-sources,order-sources,customer-celebrations}` | `{id,title}`; отсутствующий эндпоинт пропускается |
| 11 | складские документы | `/v1/{packing,write-off,markdown,sorting,inventory,movement}-...` | заголовки всех 6; связи `worker`/`author` → `NULL` (workers не импортируются); **позиции только для packing** (их shape верифицирован; строка с неизвестным item пропускается) |

## Точность денег
Транзакционные суммы (итоги заказов, платежи, суммы букетов, складские
строки/себестоимость) хранятся в `Numeric(12,2)` — дробные рубли Posiflora
(напр. `5142.50`) сохраняются точно (миграция 0005). Цены каталога
(`price_value`, min/max, пороги) остаются `Integer` — у вендора они целые.
T-Bank/вебхук сравнивают суммы в копейках (`amount*100`), поэтому дробные
итоги не дают ложного `amount_mismatch`.

## Ограничения (документированы)
- **orders/bouquets**: тонкая checkout-модель теряет часть полей (qty/discount/fiscal/delivery-детали); обогатим при cutover.
- **Складские документы**: тянутся заголовки; позиции — только для packing (shape остальных строк не верифицирован). Связи на сотрудников не проставляются (workers не импортируются).
- **markdown/movement**: пусто на аккаунте — заголовки импортируются, если появятся.

## Проверено (ASGI/DB, temp venv)
Раннер с замоканным `posiflora_request` → импорт в sqlite: FK графа рецептов
(spec→swv→price, item→measure/category), идемпотентность (повторный прогон —
те же счётчики), read round-trip (`/v1/specifications/{id}` отдаёт импортированную цену). 19/19 ✅

## Отложено
- Складские документы (packing/writeoff/inventory/… + позиции) — при необходимости, тем же паттерном.
- Справочники (tags/reasons/sources/preferences/celebrations) — при необходимости.
- После импорта: переключение фронта на наш `/v1` + включение авторизации (Фаза 6).
