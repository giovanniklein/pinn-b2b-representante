from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from app.core.database import get_database
from app.core.security import decode_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/auth/login')


class CurrentUser(BaseModel):
    """Informacoes do usuario autenticado extraidas do JWT + banco."""

    id: str
    nome: str
    email: EmailStr
    representante_id: str
    tipo_usuario: str = 'representante'


async def _get_user_from_db(
    db: AsyncIOMotorDatabase,
    user_id: str,
    representante_id: str,
) -> CurrentUser:
    try:
        user_obj_id = ObjectId(user_id)
        representante_obj_id = ObjectId(representante_id)
    except (InvalidId, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Nao foi possivel validar as credenciais',
        ) from exc

    usuario_doc = await db['usuarios'].find_one({'_id': user_obj_id})
    if not usuario_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Usuario nao encontrado',
        )

    if str(usuario_doc.get('representante_id')) != representante_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Token invalido para este representante',
        )

    if usuario_doc.get('tipo_usuario') != 'representante':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Tipo de usuario invalido para este aplicativo',
        )

    representante_doc = await db['representantes'].find_one({'_id': representante_obj_id})
    if not representante_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Representante nao encontrado',
        )

    # Regra igual ao ADM: documentos sem `ativo` sao considerados ativos.
    if representante_doc.get('ativo', True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Representante inativo',
        )

    return CurrentUser(
        id=str(usuario_doc['_id']),
        nome=usuario_doc.get('nome', ''),
        email=usuario_doc.get('email'),
        representante_id=representante_id,
        tipo_usuario='representante',
    )


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_database)],
) -> CurrentUser:
    """Dependencia que retorna o usuario autenticado a partir do JWT."""

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Nao foi possivel validar as credenciais',
        headers={'WWW-Authenticate': 'Bearer'},
    )

    try:
        payload = decode_token(token)
    except Exception as exc:  # noqa: BLE001
        raise credentials_exception from exc

    if payload.get('type') != 'access':
        raise credentials_exception

    if payload.get('tipo_usuario') != 'representante':
        raise credentials_exception

    user_id: str | None = payload.get('sub')
    representante_id: str | None = payload.get('representante_id')

    if not user_id or not representante_id:
        raise credentials_exception

    return await _get_user_from_db(db, user_id=user_id, representante_id=representante_id)


async def get_current_representante_id(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> str:
    """Atalho para obter apenas o ID do representante autenticado."""

    return current_user.representante_id
