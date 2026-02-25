# app/auth/service.py
from sqlalchemy import text
from ..db import engine

from sqlalchemy import text
from ..db import engine

def autenticar_usuario(username: str, password: str):
    """
    Valida credenciales contra STROBBE_V13.dbo.SYS_TABLA_USUARIOS_S10

    - Usuario de login: S10USUARIO
    - Campos que devuelve: S10USUARIO, S10NOMUSU, AUXCODAUX
    - Password fijo para todos: "1234" (según requerimiento)
    """

    username = (username or "").strip()
    password = (password or "").strip()

    if not username or not password:
        return None

    # 🔐 clave fija
    if password != "1234":
        return None

    sql = text("""
        SELECT
            LTRIM(RTRIM(S10_USUARIO)) AS S10_USUARIO,
            LTRIM(RTRIM(S10_NOMUSU))  AS S10_NOMUSU,
            LTRIM(RTRIM(AUX_CODAUX))  AS AUX_CODAUX
        FROM STROBBE_V13.dbo.SYS_TABLA_USUARIOS_S10
        WHERE LTRIM(RTRIM(S10_USUARIO)) = :u
    """)

    with engine.begin() as conn:
        row = conn.execute(sql, {"u": username}).mappings().first()

    if not row:
        return None  # usuario no existe en STROBBE_V13

    # ✅ devolvemos un dict compatible con tu login actual
    # (si tu login usa "id_usuario", aquí devolvemos aux_codaux como id)
    return {
        "id_usuario": row["AUX_CODAUX"],      # útil para identity si lo usas
        "username": row["S10_USUARIO"],       # login
        "nombre": row["S10_NOMUSU"],          # nombre real
        "codigo": row["AUX_CODAUX"],          # código ERP
        "dni": None,
        "area": None,
        "cargo": None,
    }
