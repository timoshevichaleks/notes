# RUNBOOK — AI Notes

Оперативная шпаргалка: деплой, откат, логи, типовые проблемы.

## Деплой

Образ API собирается из `api/Dockerfile`. На любом хосте с Docker:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
docker compose up --build -d
```

Миграции применяются автоматически при старте контейнера
(`CMD` выполняет `prisma migrate deploy` перед `node dist/main.js`).

**Staging vs production:** один и тот же образ, разные `.env` / переменные окружения
(разные `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`). Релиз = пересборка образа из нужного git-коммита.

## Rollback

- **Код:** откатиться на предыдущий git-коммит/тег и пересобрать образ
  (в CI образы стоит тегировать по git-SHA → откат = деплой предыдущего тега).
- **Контейнер:** `docker compose up -d` с предыдущим тегом образа API.
- **Миграция БД:**
  - бэкап перед релизом: `docker exec ainotes-pg-compose pg_dump -U postgres ainotes > backup.sql`
  - откат последней миграции: `npx prisma migrate resolve --rolled-back <migration_name>` + восстановление из бэкапа при необходимости.
- **Быстрый откат фичи:** `git revert <sha>` → push → CI пересоберёт.

## Логи и наблюдаемость

- Приложение пишет **структурные JSON-логи** (pino) в stdout: `docker compose logs -f api`.
- Точки роста (под «observability» из вакансии):
  - **Метрики:** `@willsoto/nestjs-prometheus` → эндпоинт `/metrics` → Prometheus + Grafana.
  - **Трейсинг:** OpenTelemetry SDK + экспортёр (OTLP → Jaeger/Tempo).
  - **LLM-observability:** обернуть вызовы `SummariesService` в Langfuse для трейсинга промптов/токенов/латентности.

## Типовые проблемы

| Симптом | Причина | Действие |
| ------- | ------- | -------- |
| Заметки висят в `PENDING` | воркер/Redis недоступен | `docker compose logs redis api`; проверь `REDIS_HOST/PORT` |
| Все summary вида `[mock]` | не задан `ANTHROPIC_API_KEY` | задай ключ и перезапусти api |
| Статус заметки `FAILED` | Claude API недоступен / превышены ретраи | смотри логи воркера; проверь ключ и лимиты |
| 401 на `/notes` | нет/истёк JWT (срок 1 день) | перелогинься на фронте |
| api не стартует | Postgres не готов | проверь healthcheck postgres; перезапусти стек |
| Порт 5432/6379 занят | конфликт с другим контейнером | останови чужой контейнер или поменяй проброс портов |

## Полезные команды

```bash
docker compose ps                        # статус сервисов
docker compose logs -f api               # логи API/воркера
docker exec -it ainotes-pg-compose psql -U postgres ainotes   # консоль БД
docker compose down                      # остановить стек (данные в томах сохраняются)
```
