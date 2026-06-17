# AI Notes — RAG-расширение (дизайн)

**Дата:** 2026-06-16
**База:** существующий проект AI Notes (Angular + NestJS + Postgres/Prisma + Redis/BullMQ + Claude).
**Цель:** добавить семантический поиск по заметкам через RAG (Retrieval-Augmented Generation) с настоящим вектором БД (pgvector), чтобы на практике понять, как работают эмбеддинги, векторное хранилище и RAG-цикл.

---

## 1. Решения

- **Эмбеддинги:** локальная модель `all-MiniLM-L6-v2` (384-dim) через `@xenova/transformers` — работает в Node без API-ключа и без интернета (после первой загрузки ~25МБ кешируется). Даёт реальный семантический поиск бесплатно.
- **Хранилище:** PostgreSQL + расширение **pgvector**. Образ Postgres меняется на `pgvector/pgvector:pg16` (тот же Postgres + расширение). Это аутентичный «vector DB» — прямое попадание в требования.
- **Генерация ответа:** Claude (`claude-opus-4-8`) через существующий паттерн; при отсутствии `ANTHROPIC_API_KEY` — мок-ответ (проект работает из коробки).

---

## 2. Компоненты

| Компонент | Ответственность |
|---|---|
| `EmbeddingsService` (новый) | текст → вектор `number[]` (384) через transformers.js; ленивая загрузка модели, кеш в памяти |
| `SummarizeProcessor` (правка) | помимо summary+тегов теперь считает embedding заметки и сохраняет его в `Note.embedding` |
| `NotesService.search` (новый метод) | embedding запроса → SQL top-k по косинусу → промпт Claude → `{ answer, sources }` |
| `NotesController` (правка) | новый эндпоинт `POST /notes/search` |
| Prisma schema (правка) | поле `embedding Unsupported("vector(384)")?` в `Note` |
| Миграция (новая) | `CREATE EXTENSION IF NOT EXISTS vector` + добавление колонки `embedding vector(384)` |

---

## 3. Модель данных

```
Note (добавляется одно поле)
  ...существующие поля...
  embedding  vector(384)  NULL   -- pgvector
```

Поиск ближайших — сырым SQL (Prisma не типизирует `vector`):
```sql
SELECT id, title, content
FROM "Note"
WHERE "userId" = $1 AND embedding IS NOT NULL
ORDER BY embedding <=> $2::vector   -- <=> = косинусное расстояние pgvector
LIMIT 5;
```

---

## 4. API

```
POST /notes/search   (auth)   { query: string }
   → { answer: string, sources: [{ id, title }] }
```

- Валидация DTO (`query` непустая строка).
- Изоляция: SQL всегда фильтрует по `userId`.

---

## 5. Поток данных

**Индексация (фоновая, в существующем воркере):**
```
заметка создана/изменена → задача в очереди → SummarizeProcessor:
   summary+теги (как раньше)  +  embedding(title + "\n" + content) → UPDATE Note.embedding
```

**Поиск (синхронный, по запросу):**
```
POST /notes/search { query }
   → EmbeddingsService.embed(query)
   → SQL: top-5 заметок этого юзера по embedding <=> queryVector
   → если есть ключ: Claude отвечает по найденным заметкам (контекст в промпте)
     если ключа нет: мок-ответ из найденных заголовков
   → { answer, sources }
```

---

## 6. Обработка ошибок

- Модель эмбеддингов не загрузилась → лог ошибки; заметка остаётся без вектора (не находится поиском), остальное работает.
- У пользователя нет проиндексированных заметок → `sources: []` + честный ответ «ничего не нашёл».
- Claude недоступен → фолбэк на мок-ответ.
- Безопасность: поиск только по своим заметкам (фильтр `userId` в SQL).

---

## 7. Тестирование

- **`EmbeddingsService` (unit):** один и тот же текст → вектор длины 384; похожие тексты («дедлайн Q3» / «крайний срок осенью») ближе по косинусу, чем непохожие («рецепт борща»).
- **search-логика (unit):** на мокнутых embeddings + Claude — в промпт уходят найденные заметки; пустой результат обрабатывается.
- **e2e:** register → создать 2-3 заметки → дождаться индексации → `POST /notes/search` → релевантная заметка в `sources`.

---

## 8. Соответствие требованиям вакансии

| Требование (плюс) | Где |
|---|---|
| Vector DB | pgvector |
| RAG | полный цикл индексация → retrieval → generation |
| LLM-интеграция | Claude по найденному контексту |
| Фоновые задачи | индексация в существующем BullMQ-воркере |

---

## 9. Вне scope (YAGNI)

- Чанкинг длинных документов (заметки короткие — индексируем целиком; упомянуть как точку роста).
- Реранкеры, гибридный (keyword+vector) поиск.
- Полноценный фронт для поиска — минимально или проверка через curl; основная цель — backend-механика RAG.
- Langfuse/observability вокруг retrieval — точка роста.
