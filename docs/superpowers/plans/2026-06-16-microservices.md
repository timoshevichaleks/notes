# AI Notes — Microservices Split Implementation Plan

> **For agentic workers:** выполняется через superpowers:executing-plans, по задачам. Шаги «Checkpoint» = «проверь и иди дальше», БЕЗ git (учебный пример, без коммитов).

**Goal:** разнести монолит `api` на 4 NestJS-приложения (gateway HTTP + auth/notes по TCP + worker на очереди) в режиме монорепо, не меняя фронт и схему БД.

**Architecture:** NestJS monorepo (`apps/` + `libs/`). Gateway — единственный HTTP-вход: валидирует JWT и через `ClientProxy` (TCP) зовёт auth/notes. Notes кладёт задачи в BullMQ → worker. Общий `PrismaService` и общая БД через `libs/prisma`.

**Tech Stack:** @nestjs/microservices (TCP), NestJS monorepo, BullMQ, Prisma (общая БД), Jest.

**Все команды — из `c:\TransPerfect\test\api` (PowerShell). Без git. Инфра: контейнеры `ainotes-pg` (pgvector) и `ainotes-redis` должны быть запущены (`docker start ainotes-pg ainotes-redis`).**

**Принцип переноса:** доменная логика (`AuthService`, `NotesService`, `SummariesService`, `EmbeddingsService`, `SummarizeProcessor`, Prisma, DTO) переезжает **без изменений тела методов** — меняется только обёртка (HTTP-контроллер → message-handler) и расположение файлов. Юнит-тесты этих классов переезжают как есть.

---

## Task 1: Перевести api в NestJS-монорепо + libs

**Files:**
- Modify: `api/nest-cli.json`
- Create: `apps/gateway/`, `apps/auth/`, `apps/notes/`, `apps/worker/` (каркасы)
- Create: `libs/prisma/`, `libs/contracts/`

- [ ] **Step 1: Поставить зависимость микросервисов**

Run:
```
npm install @nestjs/microservices
```

- [ ] **Step 2: Сгенерировать приложения и библиотеки через CLI**

Run (CLI сам переведёт проект в monorepo-режим при первой `generate app`):
```
npx nest generate app gateway
npx nest generate app auth
npx nest generate app notes
npx nest generate app worker
npx nest generate library prisma
npx nest generate library contracts
```
Expected: появляется `apps/{gateway,auth,notes,worker}`, `libs/{prisma,contracts}`, обновляется `nest-cli.json` (поле `projects`), создаётся `tsconfig` с путями `@app/prisma`, `@app/contracts`.

- [ ] **Step 3: Проверить пути библиотек**

Открой `api/tsconfig.json` — убедись, что в `compilerOptions.paths` есть `@app/prisma` и `@app/contracts`. Если CLI назвал иначе (напр. `@api/...`) — запомни префикс, дальше используй его.

- [ ] **Step 4: Checkpoint**

Run:
```
npx nest build gateway
```
Expected: build exit 0 (пустой gateway собирается).

---

## Task 2: libs/prisma и libs/contracts

**Files:**
- Create: `libs/prisma/src/prisma.service.ts`, `libs/prisma/src/prisma.module.ts`, `libs/prisma/src/index.ts`
- Create: `libs/contracts/src/patterns.ts`, `libs/contracts/src/index.ts`
- Move: `api/prisma/` (schema + migrations) остаётся на месте (корень api), Prisma Client уже сгенерён

- [ ] **Step 1: Перенести PrismaService в libs/prisma**

Create `libs/prisma/src/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

Create `libs/prisma/src/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Create `libs/prisma/src/index.ts`:
```typescript
export * from './prisma.service';
export * from './prisma.module';
```

- [ ] **Step 2: Описать межсервисные паттерны и типы в libs/contracts**

Create `libs/contracts/src/patterns.ts`:
```typescript
export const AUTH_PATTERNS = {
  register: 'auth.register',
  login: 'auth.login',
} as const;

export const NOTES_PATTERNS = {
  create: 'notes.create',
  list: 'notes.list',
  get: 'notes.get',
  update: 'notes.update',
  remove: 'notes.remove',
  search: 'notes.search',
} as const;

export const AUTH_SERVICE = 'AUTH_SERVICE';
export const NOTES_SERVICE = 'NOTES_SERVICE';

export interface AuthCredentials {
  email: string;
  password: string;
}
export interface CreateNotePayload {
  userId: string;
  title: string;
  content: string;
}
export interface NoteIdPayload {
  userId: string;
  id: string;
}
export interface UpdateNotePayload {
  userId: string;
  id: string;
  title?: string;
  content?: string;
}
export interface SearchPayload {
  userId: string;
  query: string;
}
export interface ListPayload {
  userId: string;
}
```

Create `libs/contracts/src/index.ts`:
```typescript
export * from './patterns';
```

- [ ] **Step 3: Checkpoint** — `npx nest build gateway` (exit 0). Удали дефолтные `libs/*/src/*.service.ts`/`*.spec.ts`, сгенерённые CLI, если они мешают сборке.

---

## Task 3: Auth-микросервис (TCP)

**Files:**
- Move into `apps/auth/src/`: `auth.service.ts`, `auth.service.spec.ts` (из старого `api/src/auth/`)
- Create: `apps/auth/src/auth.controller.ts` (message-handlers), `apps/auth/src/auth.module.ts`, `apps/auth/src/main.ts`

- [ ] **Step 1: Перенести AuthService + тест без изменений логики**

Скопируй `AuthService` (тело методов `register`/`login`/`tokenFor` не меняем) в `apps/auth/src/auth.service.ts`. Импорт Prisma поменяй на `@app/prisma`:
```typescript
import { PrismaService } from '@app/prisma';
```
Скопируй `auth.service.spec.ts` рядом, поправь импорт `PrismaService` на `@app/prisma`.

- [ ] **Step 2: Написать падающий тест message-handler**

Create `apps/auth/src/auth.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (message handlers)', () => {
  let controller: AuthController;
  const auth = { register: jest.fn(), login: jest.fn() };

  beforeEach(async () => {
    const ref = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
    controller = ref.get(AuthController);
  });

  it('register handler delegates to service', async () => {
    auth.register.mockResolvedValue({ token: 't' });
    const res = await controller.register({ email: 'a@b.c', password: 'password123' });
    expect(auth.register).toHaveBeenCalledWith('a@b.c', 'password123');
    expect(res).toEqual({ token: 't' });
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npx jest apps/auth/src/auth.controller.spec.ts`
Expected: FAIL — нет `auth.controller`.

- [ ] **Step 4: Реализовать message-handlers**

Create `apps/auth/src/auth.controller.ts`:
```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AUTH_PATTERNS, AuthCredentials } from '@app/contracts';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.register)
  register(@Payload() dto: AuthCredentials) {
    return this.auth.register(dto.email, dto.password);
  }

  @MessagePattern(AUTH_PATTERNS.login)
  login(@Payload() dto: AuthCredentials) {
    return this.auth.login(dto.email, dto.password);
  }
}
```

- [ ] **Step 5: Модуль и bootstrap (TCP)**

Create `apps/auth/src/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '@app/prisma';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

Replace `apps/auth/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.TCP,
    options: { host: process.env.AUTH_HOST ?? '0.0.0.0', port: Number(process.env.AUTH_PORT ?? 3001) },
  });
  await app.listen();
}
void bootstrap();
```

- [ ] **Step 6: Запустить тесты auth**

Run: `npx jest apps/auth`
Expected: PASS (service + controller тесты).

- [ ] **Step 7: Checkpoint** — `npx nest build auth` (exit 0).

---

## Task 4: Notes-микросервис (TCP)

**Files:**
- Move into `apps/notes/src/`: `notes.service.ts` (+ его spec'ы), `dto/note.dto.ts`, `dto/search.dto.ts`
- Create: `apps/notes/src/notes.controller.ts` (message-handlers), `apps/notes/src/notes.module.ts`, `apps/notes/src/main.ts`
- Create: `libs/contracts/src/queue.ts` (имя очереди)

- [ ] **Step 1: Общая константа очереди в contracts**

Create `libs/contracts/src/queue.ts`:
```typescript
export const SUMMARIZE_QUEUE = 'summarize-queue';
```
Modify `libs/contracts/src/index.ts` — добавить `export * from './queue';`.

- [ ] **Step 2: Перенести NotesService + EmbeddingsService + SummariesService зависимости**

Notes-сервису для `search` нужны `EmbeddingsService` и `SummariesService`. Чтобы не плодить дубли, перенеси `EmbeddingsService` и `SummariesService` в `libs` (создай `libs/ai`), либо (проще для старта) держи их копии в worker и notes. **Решение:** вынести оба в `libs/ai`:

Create `libs/ai/src/embeddings.service.ts` — тело из текущего `api/src/embeddings/embeddings.service.ts` (без изменений).
Create `libs/ai/src/summaries.service.ts` — тело из текущего `api/src/summaries/summaries.service.ts` (без изменений).
Create `libs/ai/src/ai.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { SummariesService } from './summaries.service';

@Module({
  imports: [ConfigModule],
  providers: [EmbeddingsService, SummariesService],
  exports: [EmbeddingsService, SummariesService],
})
export class AiModule {}
```
Create `libs/ai/src/index.ts`:
```typescript
export * from './embeddings.service';
export * from './summaries.service';
export * from './ai.module';
```
Run: `npx nest generate library ai` ПЕРЕД созданием файлов (чтобы CLI прописал путь `@app/ai` в tsconfig), затем замени сгенерённые файлы на свои.

- [ ] **Step 3: Перенести NotesService с обновлёнными импортами**

Скопируй `NotesService` в `apps/notes/src/notes.service.ts`. Импорты:
```typescript
import { PrismaService } from '@app/prisma';
import { EmbeddingsService, SummariesService } from '@app/ai';
import { SUMMARIZE_QUEUE } from '@app/contracts';
```
Тело методов (`create/findAll/findOne/update/remove/search`) — без изменений. Перенеси `dto/note.dto.ts`, `dto/search.dto.ts` и спеки `notes.service.spec.ts`, `notes.search.spec.ts` (поправь импорты на `@app/*`).

- [ ] **Step 4: Падающий тест message-handler**

Create `apps/notes/src/notes.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

describe('NotesController (message handlers)', () => {
  let controller: NotesController;
  const notes = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    search: jest.fn(),
  };

  beforeEach(async () => {
    const ref = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [{ provide: NotesService, useValue: notes }],
    }).compile();
    controller = ref.get(NotesController);
  });

  it('create handler delegates with userId', async () => {
    notes.create.mockResolvedValue({ id: 'n1' });
    const res = await controller.create({ userId: 'u1', title: 't', content: 'c' });
    expect(notes.create).toHaveBeenCalledWith('u1', { title: 't', content: 'c' });
    expect(res).toEqual({ id: 'n1' });
  });
});
```

- [ ] **Step 5: Запустить — должно упасть**

Run: `npx jest apps/notes/src/notes.controller.spec.ts`
Expected: FAIL — нет `notes.controller`.

- [ ] **Step 6: Реализовать message-handlers**

Create `apps/notes/src/notes.controller.ts`:
```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  NOTES_PATTERNS,
  CreateNotePayload,
  NoteIdPayload,
  UpdateNotePayload,
  SearchPayload,
  ListPayload,
} from '@app/contracts';
import { NotesService } from './notes.service';

@Controller()
export class NotesController {
  constructor(private notes: NotesService) {}

  @MessagePattern(NOTES_PATTERNS.create)
  create(@Payload() p: CreateNotePayload) {
    return this.notes.create(p.userId, { title: p.title, content: p.content });
  }

  @MessagePattern(NOTES_PATTERNS.list)
  list(@Payload() p: ListPayload) {
    return this.notes.findAll(p.userId);
  }

  @MessagePattern(NOTES_PATTERNS.get)
  get(@Payload() p: NoteIdPayload) {
    return this.notes.findOne(p.userId, p.id);
  }

  @MessagePattern(NOTES_PATTERNS.update)
  update(@Payload() p: UpdateNotePayload) {
    return this.notes.update(p.userId, p.id, { title: p.title, content: p.content });
  }

  @MessagePattern(NOTES_PATTERNS.remove)
  remove(@Payload() p: NoteIdPayload) {
    return this.notes.remove(p.userId, p.id);
  }

  @MessagePattern(NOTES_PATTERNS.search)
  search(@Payload() p: SearchPayload) {
    return this.notes.search(p.userId, p.query);
  }
}
```

- [ ] **Step 7: Модуль и bootstrap (TCP + BullMQ producer)**

Create `apps/notes/src/notes.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@app/prisma';
import { AiModule } from '@app/ai';
import { SUMMARIZE_QUEUE } from '@app/contracts';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AiModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        },
      }),
    }),
    BullModule.registerQueue({ name: SUMMARIZE_QUEUE }),
  ],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
```

Replace `apps/notes/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotesModule } from './notes.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotesModule, {
    transport: Transport.TCP,
    options: { host: process.env.NOTES_HOST ?? '0.0.0.0', port: Number(process.env.NOTES_PORT ?? 3002) },
  });
  await app.listen();
}
void bootstrap();
```

- [ ] **Step 8: Запустить тесты notes**

Run: `npx jest apps/notes`
Expected: PASS (service + search + controller).

- [ ] **Step 9: Checkpoint** — `npx nest build notes` (exit 0).

---

## Task 5: Worker-сервис (очередь)

**Files:**
- Move into `apps/worker/src/`: `summarize.processor.ts` (+ spec) из старого `api/src/jobs/`
- Create: `apps/worker/src/worker.module.ts`, `apps/worker/src/main.ts`

- [ ] **Step 1: Перенести процессор**

Скопируй `SummarizeProcessor` в `apps/worker/src/summarize.processor.ts`. Импорты:
```typescript
import { PrismaService } from '@app/prisma';
import { SummariesService, EmbeddingsService } from '@app/ai';
import { SUMMARIZE_QUEUE } from '@app/contracts';
```
Тело `process`/`onFailed` — без изменений. Перенеси `summarize.processor.spec.ts`, поправь импорты на `@app/*`.

- [ ] **Step 2: Модуль и bootstrap (обычное app, без HTTP-порта)**

Create `apps/worker/src/worker.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@app/prisma';
import { AiModule } from '@app/ai';
import { SUMMARIZE_QUEUE } from '@app/contracts';
import { SummarizeProcessor } from './summarize.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AiModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        },
      }),
    }),
    BullModule.registerQueue({
      name: SUMMARIZE_QUEUE,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    }),
  ],
  providers: [SummarizeProcessor],
})
export class WorkerModule {}
```

Replace `apps/worker/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  // Обычное приложение: BullMQ-воркер живёт внутри, HTTP-порт не нужен.
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.init();
}
void bootstrap();
```

- [ ] **Step 3: Тесты worker**

Run: `npx jest apps/worker`
Expected: PASS (processor spec).

- [ ] **Step 4: Checkpoint** — `npx nest build worker` (exit 0).

---

## Task 6: Gateway (HTTP + JWT + ClientProxy)

**Files:**
- Move into `apps/gateway/src/`: `jwt.strategy.ts`, `jwt-auth.guard.ts`, `current-user.decorator.ts` (из старого `api/src/auth/`); `auth.dto.ts`
- Create: `apps/gateway/src/auth.controller.ts`, `apps/gateway/src/notes.controller.ts`, `apps/gateway/src/health.controller.ts`
- Create: `apps/gateway/src/app.module.ts` (или замена сгенерённого), `apps/gateway/src/main.ts`

- [ ] **Step 1: Перенести JWT-обвязку и DTO**

Скопируй в `apps/gateway/src/`: `jwt.strategy.ts`, `jwt-auth.guard.ts`, `current-user.decorator.ts`, и `dto/auth.dto.ts`, `dto/note.dto.ts`, `dto/search.dto.ts` (DTO нужны для валидации входящего HTTP). Импорты `@nestjs/*` без изменений.

- [ ] **Step 2: Зарегистрировать ClientProxy к auth и notes**

Create/replace `apps/gateway/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { LoggerModule } from 'nestjs-pino';
import { AUTH_SERVICE, NOTES_SERVICE } from '@app/contracts';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { NotesController } from './notes.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('AUTH_HOST', 'localhost'),
            port: Number(config.get<string>('AUTH_PORT', '3001')),
          },
        }),
      },
      {
        name: NOTES_SERVICE,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('NOTES_HOST', 'localhost'),
            port: Number(config.get<string>('NOTES_PORT', '3002')),
          },
        }),
      },
    ]),
  ],
  controllers: [AuthController, NotesController, HealthController],
  providers: [JwtStrategy],
})
export class AppModule {}
```

- [ ] **Step 3: HTTP-контроллеры, проксирующие в сервисы**

Create `apps/gateway/src/auth.controller.ts`:
```typescript
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AUTH_SERVICE, AUTH_PATTERNS } from '@app/contracts';
import { AuthDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private auth: ClientProxy) {}

  @Post('register')
  register(@Body() dto: AuthDto) {
    return firstValueFrom(this.auth.send(AUTH_PATTERNS.register, dto));
  }

  @Post('login')
  login(@Body() dto: AuthDto) {
    return firstValueFrom(this.auth.send(AUTH_PATTERNS.login, dto));
  }
}
```

Create `apps/gateway/src/notes.controller.ts`:
```typescript
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { NOTES_SERVICE, NOTES_PATTERNS } from '@app/contracts';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { SearchDto } from './dto/search.dto';

@UseGuards(JwtAuthGuard)
@Controller('notes')
export class NotesController {
  constructor(@Inject(NOTES_SERVICE) private notes: ClientProxy) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return firstValueFrom(this.notes.send(NOTES_PATTERNS.list, { userId: user.userId }));
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateNoteDto) {
    return firstValueFrom(this.notes.send(NOTES_PATTERNS.create, { userId: user.userId, ...dto }));
  }

  @Post('search')
  search(@CurrentUser() user: { userId: string }, @Body() dto: SearchDto) {
    return firstValueFrom(this.notes.send(NOTES_PATTERNS.search, { userId: user.userId, query: dto.query }));
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return firstValueFrom(this.notes.send(NOTES_PATTERNS.get, { userId: user.userId, id }));
  }

  @Patch(':id')
  update(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: UpdateNoteDto) {
    return firstValueFrom(this.notes.send(NOTES_PATTERNS.update, { userId: user.userId, id, ...dto }));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return firstValueFrom(this.notes.send(NOTES_PATTERNS.remove, { userId: user.userId, id }));
  }
}
```

Create `apps/gateway/src/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 4: Bootstrap gateway (HTTP)**

Replace `apps/gateway/src/main.ts`:
```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

- [ ] **Step 5: Checkpoint** — `npx nest build gateway` (exit 0).

---

## Task 7: Проброс доменных ошибок через RPC

**Files:**
- Create: `libs/contracts/src/rpc.ts`
- Modify: сервисы auth/notes (заменить Nest HTTP-исключения на RpcException) ИЛИ добавить фильтр в gateway

- [ ] **Step 1: Стратегия — статус-код в RpcException**

Доменные сервисы сейчас бросают `ConflictException`/`UnauthorizedException`/`NotFoundException` (HTTP). Через TCP они прилетят как generic-ошибки. Простейшее решение для учебного проекта: в gateway-контроллерах ловить ошибку RPC и пробрасывать как `HttpException` с её `status`/`message`. Добавь хелпер:

Create `libs/contracts/src/rpc.ts`:
```typescript
// Доменные сервисы кидают Nest HttpException-подобные объекты;
// при передаче через TCP сохраняется поле response с { statusCode, message }.
export interface RpcErrorShape {
  statusCode?: number;
  message?: string | string[];
}
```

- [ ] **Step 2: Обернуть вызовы в gateway общим маппером**

В `apps/gateway/src/notes.controller.ts` и `auth.controller.ts` оберни `firstValueFrom(...)` в helper, который маппит ошибку. Добавь в каждый контроллер приватный метод (или вынеси в `apps/gateway/src/rpc.util.ts`):

Create `apps/gateway/src/rpc.util.ts`:
```typescript
import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { Observable, firstValueFrom } from 'rxjs';
import { RpcErrorShape } from '@app/contracts';

export async function callService<T>(obs$: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(obs$);
  } catch (err) {
    const e = err as RpcErrorShape;
    if (e && typeof e.statusCode === 'number') {
      throw new HttpException(e.message ?? 'Error', e.statusCode);
    }
    throw new InternalServerErrorException('Upstream service error');
  }
}
```
Замени в обоих gateway-контроллерах `firstValueFrom(this.x.send(...))` на `callService(this.x.send(...))`.

- [ ] **Step 3: Чтобы статус долетал — в микросервисах не глотать HttpException**

В `apps/auth/src/main.ts` и `apps/notes/src/main.ts` Nest по умолчанию сериализует выброшенные ошибки. Дополнительно ничего не требуется: `HttpException` сериализуется с полем `message` и `status`. (Если статус теряется — добавь в сервисы выброс через `throw new RpcException({ statusCode, message })`; для учебного объёма оставляем HttpException.)

- [ ] **Step 4: Checkpoint** — `npx nest build gateway` (exit 0), `npx jest` (все юнит-тесты зелёные).

---

## Task 8: e2e через gateway

**Files:**
- Create: `apps/gateway/test/gateway.e2e-spec.ts`
- Note: e2e требует запущенных auth+notes (TCP) + worker + инфра. Эмбеддинги в Jest не работают (см. RAG-план) — поэтому e2e проверяет auth+CRUD, а семантический поиск проверяется рантайм-смоуком.

- [ ] **Step 1: Запустить сервисы для e2e (в отдельных терминалах/фоне)**

Run:
```
docker start ainotes-pg ainotes-redis
npx nest build auth notes
node dist/apps/auth/main.js   # терминал 1
node dist/apps/notes/main.js  # терминал 2
```

- [ ] **Step 2: e2e gateway (auth + CRUD)**

Create `apps/gateway/test/gateway.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Gateway (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const email = `ms-${Date.now()}@test.local`;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('health ok', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('register → login → create note via gateway', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password123' }).expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    token = login.body.token;
    const note = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Hello', content: 'body' })
      .expect(201);
    expect(note.body.status).toBe('PENDING');
  });
});
```

- [ ] **Step 3: Прогнать e2e**

Run: `npx jest --config apps/gateway/test/jest-e2e.json` (или общий e2e-конфиг монорепо)
Expected: PASS (health + auth + create через gateway → notes-сервис).

- [ ] **Step 4: Checkpoint** — остановить руками поднятые `node dist/apps/*/main.js`.

---

## Task 9: Dockerfile-ы и docker-compose

**Files:**
- Create: `apps/gateway/Dockerfile`, `apps/auth/Dockerfile`, `apps/notes/Dockerfile`, `apps/worker/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Dockerfile на каждый app (параметризуем target)**

Пример `apps/gateway/Dockerfile` (остальные — копия с заменой имени app и команды запуска):
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx nest build gateway
EXPOSE 3000
CMD ["node", "dist/apps/gateway/main.js"]
```
Для `auth`: `nest build auth`, `CMD node dist/apps/auth/main.js`, без EXPOSE 3000 (TCP-порт 3001).
Для `notes`: `nest build notes`, порт 3002.
Для `worker`: `nest build worker`, `CMD sh -c "npx prisma migrate deploy && node dist/apps/worker/main.js"` (миграции применяем здесь — один раз).

- [ ] **Step 2: docker-compose с 5 сервисами**

Modify `docker-compose.yml` — заменить единый `api` на четыре сервиса:
```yaml
  gateway:
    build: { context: ./api, dockerfile: apps/gateway/Dockerfile }
    environment:
      JWT_SECRET: dev-secret-change-me
      AUTH_HOST: auth
      AUTH_PORT: 3001
      NOTES_HOST: notes
      NOTES_PORT: 3002
    ports: ['3000:3000']
    depends_on: [auth, notes]

  auth:
    build: { context: ./api, dockerfile: apps/auth/Dockerfile }
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ainotes?schema=public
      JWT_SECRET: dev-secret-change-me
      AUTH_PORT: 3001
    depends_on: { postgres: { condition: service_healthy } }

  notes:
    build: { context: ./api, dockerfile: apps/notes/Dockerfile }
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ainotes?schema=public
      REDIS_HOST: redis
      REDIS_PORT: 6379
      NOTES_PORT: 3002
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  worker:
    build: { context: ./api, dockerfile: apps/worker/Dockerfile }
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ainotes?schema=public
      REDIS_HOST: redis
      REDIS_PORT: 6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
```
(Блоки `postgres` и `redis` оставить как есть; `postgres` — образ `pgvector/pgvector:pg16`.)

- [ ] **Step 3: Checkpoint** — `docker compose build gateway auth notes worker` (exit 0 у всех).

---

## Task 10: Финальная проверка + чистка

**Files:**
- Delete: старый `api/src/` (модули, переехавшие в apps/libs), старые `api/Dockerfile`, единый `main.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Удалить осиротевший старый код**

Удали `api/src/` целиком (всё переехало в `apps/` и `libs/`), старый `api/Dockerfile`. Проверь, что в `nest-cli.json` `sourceRoot`/`projects` указывают на apps/libs, и нет ссылок на старый `src`.

- [ ] **Step 2: Обновить CI**

Modify `.github/workflows/ci.yml` (job `api`): заменить `npm run build` на сборку всех app:
```yaml
      - run: npx nest build gateway
      - run: npx nest build auth
      - run: npx nest build notes
      - run: npx nest build worker
```
`format:check`/`lint:check`/`npm test` остаются.

- [ ] **Step 3: Рантайм-смоук всего стека**

Run:
```
docker compose up --build
```
В отдельном терминале прогнать: register → login → create note → (подождать worker) → search через `http://localhost:3000` (gateway). Ожидаемо: заметка доходит до `DONE`, поиск возвращает релевантные источники.

- [ ] **Step 4: Финальный checkpoint** — `npx jest` (все юнит-тесты), `npx nest build gateway auth notes worker`.

---

## Соответствие спеку

| Раздел спека | Задачи |
|---|---|
| Монорепо (apps + libs) | Task 1, 2 |
| Auth микросервис (TCP) | Task 3 |
| Notes микросервис (TCP) | Task 4 |
| Worker (очередь) | Task 5 |
| Gateway (HTTP + JWT + ClientProxy) | Task 6 |
| Проброс ошибок RPC→HTTP | Task 7 |
| Тесты (unit + e2e) | Task 3-6, 8 |
| Docker / 5 сервисов | Task 9 |
| Общая БД (libs/prisma) | Task 2 |
| CI | Task 10 |

## Замечания
- Фронт `web` и схема БД/миграции **не меняются** — контракт `/auth/*`, `/notes/*` на gateway прежний.
- Эмбеддинги не работают в Jest (realm/onnx) — семантический поиск проверяется рантайм-смоуком (Task 10), а не e2e.
- Точки роста: DB-per-service + Saga, gRPC вместо TCP, service discovery, отдельные миграции на сервис.
