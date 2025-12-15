import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    SECRET_KEY     = os.getenv("SECRET_KEY", "dev")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt")

    SQL_SERVER   = os.getenv("SQL_SERVER")
    SQL_DATABASE = os.getenv("SQL_DATABASE")
    SQL_USER     = os.getenv("SQL_USER")
    SQL_PASSWORD = os.getenv("SQL_PASSWORD")
    SQL_DRIVER   = os.getenv("SQL_DRIVER", "ODBC Driver 17 for SQL Server")
    SQL_TRUST    = os.getenv("SQL_TRUST_CERT", "yes")  # yes/no

    SQLALCHEMY_DATABASE_URI = (
        "mssql+pyodbc://"
        f"{SQL_USER}:{SQL_PASSWORD}@{SQL_SERVER}/{SQL_DATABASE}"
        f"?driver={SQL_DRIVER.replace(' ', '+')}"
        f"&TrustServerCertificate={SQL_TRUST}"
    )