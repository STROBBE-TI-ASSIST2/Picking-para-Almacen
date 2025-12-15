# app/auth/service.py
from sqlalchemy import text
from ..db import engine

def autenticar_usuario(username: str, password: str):
    """
    Valida credenciales contra la tabla 'usuarios'.
    Por ahora compara password en texto plano.
    """
    sql = text("""
        SELECT id_usuario, username, password, dni, area, cargo, codigo
        FROM dbo.USUARIO
        WHERE username = :u
    """)

    with engine.begin() as conn:
        row = conn.execute(sql, {"u": username}).mappings().first()

    if not row:
        return None  # usuario no existe

    # ⚠️ Más adelante: usar hash, ahora texto plano:
    if row["password"] != password:
        return None

    return {
        "id_usuario": row["id_usuario"],
        "username": row["username"],
        "dni": row["dni"],
        "area": row["area"],
        "cargo": row["cargo"],
        "codigo": row["codigo"],
    }