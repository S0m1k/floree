from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

# pool_pre_ping: Postgres (или сеть/NAT) закрывает простаивающие соединения, и
# без пинга первый запрос после простоя падал 500-кой «connection is closed» —
# в т.ч. на валидации промокода прямо в чекауте. pool_recycle страхует от
# соединений старше 30 минут ещё до пинга.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=1800,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
