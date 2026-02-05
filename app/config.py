import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    # =========================
    # Flask
    # =========================
    SECRET_KEY = os.getenv("SECRET_KEY", "dev")

    # =========================
    # JWT
    # =========================
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt")

    # 👉 Para que @jwt_required() funcione en rutas HTML (GET),
    # necesitas que el token viaje automáticamente: eso lo hacen las COOKIES.
    JWT_TOKEN_LOCATION = ["cookies"]

    # Nombre de la cookie (puedes dejar el default, pero así queda explícito)
    JWT_ACCESS_COOKIE_NAME = "access_token"

    # En local/dev False. En producción (HTTPS) debe ser True.
    JWT_COOKIE_SECURE = os.getenv("JWT_COOKIE_SECURE", "false").lower() == "true"

    # Si no tienes HTTPS aún, igual puedes usar cookies en dev.
    # Para tu caso (app interna), puedes empezar con CSRF desactivado.
    # Luego lo activamos cuando todo funcione.
    JWT_COOKIE_CSRF_PROTECT = os.getenv("JWT_COOKIE_CSRF_PROTECT", "false").lower() == "true"

    # Duración del token (ajústalo a tu operación)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv("JWT_EXPIRES_HOURS", "8")))

    # Recomendado para cookies
    JWT_COOKIE_SAMESITE = os.getenv("JWT_COOKIE_SAMESITE", "Lax")  # Lax / Strict / None
    JWT_COOKIE_DOMAIN = os.getenv("JWT_COOKIE_DOMAIN")  # opcional

    # =========================
    # SQL Server
    # =========================
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

    SQLALCHEMY_TRACK_MODIFICATIONS = False
