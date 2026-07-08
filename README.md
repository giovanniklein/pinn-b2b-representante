# KIPI B2B - Portal Representante

Manual tecnico e funcional do app do representante.
Use este README como fonte de contexto para manutencao, deploy e operacao.

---

## Visao geral

Portal B2B para representantes venderem produtos dos parceiros participantes em um unico app.

Principais objetivos:
- Catalogo unificado de produtos (multi-atacadista).
- Catalogo com imagens servidas por URL (`thumb_url` / `image_url`) para evitar payload pesado.
- Fluxo mobile-first para descoberta e venda.
- Carrinho multi-atacadista.
- Fechamento com multiplos pedidos (1 pedido por atacadista).
- Selecao de endereco e condicao de pagamento por atacadista.
- Historico de pedidos com PDF e compartilhamento.
- Autenticacao JWT (access + refresh).

---

## Branding

A identidade visual atual do app e **KIPI**.

Aplicado em:
- `frontend/src/layouts/AuthLayout.tsx`
- `frontend/src/layouts/MainLayout.tsx`
- `frontend/public/logo.jpeg`

---

## Arquitetura

- Backend: `backend/`
  - FastAPI + Motor (MongoDB)
  - Pydantic / pydantic-settings
  - JWT com `tipo_usuario="representante"` e `representante_id` no payload
  - Multi-tenant por `representante_id` (sempre derivado do token)

- Frontend: `frontend/`
  - React + Vite + Chakra UI
  - React Router v6
  - Zustand (auth/UI store)
  - Axios interceptors com refresh automatico de token

Backends representante e atacadista sao independentes, mas compartilham o mesmo MongoDB.

---

## Fluxo funcional

### Publico
- `/login`
- `/register`

### Protegido
- `/produtos`
  - Vitrine em grade de fotos
  - Scroll infinito
  - Quando ha busca/filtro ativo: cards mais detalhados (nome + precos por unidade + qtd. unitaria)
- `/produtos/:id`
  - Detalhe do produto
  - Selecao de unidade
  - Quantidade com controle `-` e `+`
  - Adicionar ao carrinho
- `/carrinho`
  - Itens por atacadista
  - Selecao de endereco por atacadista
  - Selecao de condicao de pagamento por atacadista (default `A VISTA`)
- `/pedidos`
  - Lista de pedidos (inclui condicao de pagamento)
- `/pedidos/:id`
  - Detalhe do pedido (inclui condicao de pagamento)
  - Gerar PDF
  - Compartilhar PDF (WhatsApp e outros apps, quando suportado)
  - Duplicar pedido
- `/perfil`
  - Dados cadastrais
  - Enderecos (CRUD)
- `/dashboard`

---

## Regras importantes de negocio

- O frontend nunca envia `representante_id`; o backend extrai do JWT.
- O fechamento do carrinho valida:
  - endereco selecionado por atacadista
  - condicao de pagamento escolhida entre as condicoes ofertadas pelo atacadista
  - pedido minimo por atacadista
- Condicao de pagamento e gravada no pedido em `condicao_pagamento`.
- Pedidos gerados no Venda Mais gravam `origem_venda="venda_mais"`, `representante_id` e snapshot dos valores de comissão.
- O catálogo exibe apenas parceiros com `participa_venda_mais=true`.

---

## Endpoints principais

- Auth
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
  - `POST /auth/refresh`

- Produtos
  - `GET /produtos/`
  - `GET /produtos/{produto_id}`

Observacao:
- O backend do representante passou a retornar `thumb_url` na listagem e `image_url` no detalhe quando disponiveis.
- `imagem_base64` permanece apenas como fallback temporario para registros antigos.

- Enderecos
  - `GET /enderecos/`
  - `POST /enderecos/`
  - `PUT /enderecos/{endereco_id}`
  - `DELETE /enderecos/{endereco_id}`
  - `POST /enderecos/{endereco_id}/definir-principal`

- Carrinho
  - `GET /carrinho/`
  - `POST /carrinho/itens`
  - `PUT /carrinho/itens/{produto_id}`
  - `DELETE /carrinho/itens/{produto_id}`
  - `POST /carrinho/finalizar`

- Pedidos
  - `GET /pedidos/`
  - `GET /pedidos/{id}`
  - `POST /pedidos/{id}/duplicar`

---

## Estrutura importante

- Backend
  - `backend/app/api/v1/` - rotas REST
  - `backend/app/services/` - regras de negocio
  - `backend/app/schemas/` - modelos Pydantic
  - `backend/app/utils/dependencies.py` - auth e contexto do representante

- Frontend
  - `frontend/src/api/client.ts` - axios e refresh token
  - `frontend/src/store/authStore.ts` - sessao
  - `frontend/src/pages/` - telas

---

## Executar localmente

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```
Swagger: `http://localhost:8001/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App: `http://localhost:5174`

---

## Variaveis de ambiente

### Backend (`pinn-b2b-representante/.env`)
Exemplo:
```env
MONGODB_USERNAME=...
MONGODB_PASSWORD=...
MONGODB_HOST=...
MONGODB_DATABASE=...
JWT_SECRET_KEY=...
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL=http://localhost:8001
```

---

## Dependencias relevantes (frontend)

- `jspdf`
- `jspdf-autotable`

Usadas para geracao de PDF em `OrderDetailsPage`.

---

## Seeds

Na inicializacao, o backend cria um representante e usuario de exemplo (idempotente).

Credenciais seed:
- Email: `pinn_representante@pinn.com`
- Senha: `pinn001`

---

## Deploy

### Frontend (Vercel)
- Build automatico via GitHub
- Variavel obrigatoria: `VITE_API_BASE_URL=https://<backend-url>`

### Backend (Render)
- Start command:
```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

---

## Observacoes de diagnostico

- Erro de autenticacao em mobile pode ocorrer com redirects 307 sem header Authorization.
  - Preferir chamadas com barra final nos endpoints que usam esse padrao (`/carrinho/`, `/enderecos/`, `/pedidos/`).
- Campos numericos podem vir nulos em cenarios de dados incompletos.
  - Sempre aplicar fallback ao formatar moeda.
- Imagens grandes em base64 no Mongo degradam muito o catalogo.
  - O fluxo recomendado agora e servir imagens por `thumb_url` na listagem e `image_url` no detalhe.

---

## Boas praticas

- Nao versionar `.env`, `node_modules`, `frontend/dist`, `__pycache__`, `*.pyc`.
- Validar dados antes de renderizar no frontend.
- Manter consistencia de UX entre mobile e desktop.
