# AI Notes — разбивка backend на микросервисы (дизайн)

**Дата:** 2026-06-16
**База:** монолит `api` (NestJS). Фронт `web` и схема БД не меняются.
**Цель:** разнести backend на микросервисы, чтобы на практике понять gateway, sync (TCP) и async (очередь) межсервисную связь.

## Решения
- **Объём:** полная разбивка — Gateway + Auth + Notes + AI Worker.
- **Транспорт sync:** TCP (`@nestjs/microservices`, встроенный, без доп-инфры).
- **Данные:** общая БД на старте (распределённый монолит). Точка роста — DB-per-service + Saga.
- **JWT:** валидируется в Gateway (общий секрет); `userId` передаётся в payload TCP-запросов.

## Структура — NestJS monorepo

```
api/
├── apps/
│   ├── gateway/   HTTP :3000 — REST для Angular, JWT-guard, ClientProxy → auth/notes
│   ├── auth/      TCP — auth.register / auth.login
│   ├── notes/     TCP — notes.create / list / get / update / remove / search
│   └── worker/    BullMQ Processor — summary + embedding (перенос as-is)
└── libs/
    ├── prisma/     общий PrismaService (общая БД)
    └── contracts/  message-паттерны (константы) + payload-интерфейсы/DTO
```

## Сервисы

| Сервис | Тип | Содержимое (откуда переезжает) |
|---|---|---|
| gateway | HTTP | контроллеры `/auth/*` и `/notes/*`, `JwtAuthGuard`, `JwtStrategy`, `ClientProxy` к auth и notes, health |
| auth | TCP microservice | `AuthService` (bcrypt, выдача JWT) как `@MessagePattern` |
| notes | TCP microservice | `NotesService` (CRUD + search) как `@MessagePattern`; продюсер BullMQ |
| worker | очередь | `SummarizeProcessor` + `SummariesService` + `EmbeddingsService` (без изменений логики) |

## Коммуникация

```
Angular ──HTTP──▶ gateway ──TCP(send)──▶ auth   (auth.register/login)
                         └──TCP(send)──▶ notes  (notes.*)  ──Redis/BullMQ──▶ worker
```

- Angular ↔ gateway: HTTP, контракт прежний (`POST /auth/register|login`, `/notes`, `/notes/search`) — фронт не трогаем.
- gateway → auth/notes: `client.send(pattern, payload)` (request/response, Observable).
- notes → worker: BullMQ (async, уже работает, не меняем).
- JWT: gateway проверяет токен в guard и кладёт `userId` в payload; notes/auth о JWT не знают.

## Данные
Общая БД. `libs/prisma` экспортирует `PrismaService`, импортируется в auth/notes/worker. JOIN `Note`↔`User` остаётся. БД-схема и миграции — без изменений.

## Обработка ошибок
- Доменные ошибки сервиса → `RpcException` с кодом; gateway маппит в HTTP (409/401/404/400).
- Сервис недоступен → таймаут `ClientProxy` → gateway отдаёт 503.
- Worker → ретраи BullMQ (как сейчас).

## Тестирование
- Юнит-тесты `AuthService`/`NotesService`/`SummariesService`/`EmbeddingsService`/процессора переезжают как есть (логика не меняется).
- Новые тонкие тесты message-handler'ов (контроллеров микросервисов) — что паттерн зовёт сервис.
- e2e: поднять gateway+auth+notes+инфру, прогнать register→login→create→search через HTTP gateway.
- Сборка каждого app: `nest build <app>`.

## Docker / запуск
`docker-compose`: `gateway` (:3000, единственный наружу), `auth`, `notes`, `worker`, `postgres` (pgvector), `redis`. Каждый app — свой Dockerfile/target.

## Вне scope (YAGNI)
- DB-per-service и Saga (точка роста).
- gRPC/Kafka (взяли TCP).
- Service discovery / mesh — хосты задаются через env.
- Изменения фронта.
