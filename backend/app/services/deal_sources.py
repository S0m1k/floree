"""Channel → «Источник сделки» resolution.

Posiflora auto-stamps the deal source for orders arriving through a known
channel (the POS терминал stamps «Терминал», the site stamps «Сайт»); only the
admin create form asks a human to pick a chip. This helper gives each channel
a stable handle: resolve by `code`, adopt an existing title-only row imported
from Posiflora (stamping its code), or create the row on first use.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dictionary_models import CustomerDealSource

# Well-known channel codes (admin-map §2.2.2: чипы AmoCRM/Сайт/Телефон/Терминал).
SOURCE_SITE = "site"
SOURCE_TERMINAL = "terminal"
SOURCE_PHONE = "phone"
SOURCE_AMOCRM = "amocrm"

_DEFAULT_TITLES = {
    SOURCE_SITE: "Сайт",
    SOURCE_TERMINAL: "Терминал",
    SOURCE_PHONE: "Телефон",
    SOURCE_AMOCRM: "AmoCRM",
}


async def get_or_create_deal_source(
    session: AsyncSession, code: str, title: str | None = None
) -> CustomerDealSource:
    """Return the deal source for a channel `code`, creating it if needed.

    Does not commit — the caller owns the transaction.
    """
    resolved_title = title or _DEFAULT_TITLES.get(code) or code

    by_code = await session.execute(
        select(CustomerDealSource).where(CustomerDealSource.code == code)
    )
    source = by_code.scalar_one_or_none()
    if source is not None:
        return source

    # Adopt a title-only row (ETL-imported or hand-created) and stamp its code.
    # Title match is done in Python: SQL lower() can't fold Cyrillic on SQLite,
    # and the dictionary is a handful of rows.
    rows = (
        (await session.execute(select(CustomerDealSource).where(CustomerDealSource.code.is_(None))))
        .scalars()
        .all()
    )
    wanted = resolved_title.casefold()
    source = next((r for r in rows if r.title.casefold() == wanted), None)
    if source is not None:
        source.code = code
        return source

    source = CustomerDealSource(title=resolved_title, code=code)
    session.add(source)
    await session.flush()
    return source
