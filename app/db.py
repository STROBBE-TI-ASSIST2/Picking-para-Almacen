from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .config import Config

engine = create_engine(
    Config.SQLALCHEMY_DATABASE_URI,
    pool_pre_ping=True,
    pool_recycle=180,
    fast_executemany=True
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)



