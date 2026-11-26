from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import ForeignKey, ForeignKeyConstraint, JSON, String, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


ROOT = Path(__file__).resolve().parents[1]


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Base(DeclarativeBase):
    pass


class Survey(Base):
    __tablename__ = "surveys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    draft: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(default=1)
    published_version: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[str] = mapped_column(String(32), default=timestamp)


class Version(Base):
    __tablename__ = "survey_versions"

    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), primary_key=True)
    number: Mapped[int] = mapped_column(primary_key=True)
    draft_revision: Mapped[int]
    content: Mapped[dict] = mapped_column(JSON)
    published_at: Mapped[str] = mapped_column(String(32), default=timestamp)


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["survey_id", "version"], ["survey_versions.survey_id", "survey_versions.number"]
        ),
    )

    survey_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version: Mapped[int] = mapped_column(index=True)
    answers: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(32), default=timestamp)


def connect(database_url: str | None):
    if not database_url:
        folder = ROOT / "data"
        folder.mkdir(exist_ok=True)
        database_url = "sqlite:///" + (folder / "surveys.db").as_posix()

    if database_url.startswith(("postgresql://", "postgres://")):
        database_url = "postgresql+psycopg://" + database_url.split("://", 1)[1]

    engine = create_engine(database_url, pool_pre_ping=True)
    if engine.dialect.name == "sqlite":
        @event.listens_for(engine, "connect")
        def enforce_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=5000")

    return engine, sessionmaker(engine, expire_on_commit=False)
