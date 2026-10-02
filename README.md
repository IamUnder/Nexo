# Nexo

CRM operativo modular (SaaS B2B multitenant) para pymes de servicios B2B. _«Del lead al trabajo entregado.»_

> Si eres un agente de IA, lee primero [`AGENTS.md`](AGENTS.md). Estado del proyecto: [`docs/STATUS.md`](docs/STATUS.md).

## Documentación

[`AGENTS.md`](AGENTS.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`TECH_STACK.md`](TECH_STACK.md) · [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) · [`MODULES_SPEC.md`](MODULES_SPEC.md)

## Puesta en marcha

Requisitos: Node 24, pnpm 12, Docker o Podman.

```bash
pnpm install
pnpm infra:up                  # PostgreSQL 18 + MinIO + Mailpit
cp .env.example .env           # ajusta si hace falta (los valores de desarrollo ya valen)
pnpm db:migrate                # crea roles, tablas y políticas RLS
pnpm dev                       # api (:4000) + web (:5173)
```

Comprobaciones antes de cada push: `pnpm typecheck && pnpm lint && pnpm check:boundaries && pnpm test` (el contrato completo de comandos está en AGENTS.md §9).
