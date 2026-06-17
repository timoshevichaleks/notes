import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Notes flow (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const email = `e2e-${Date.now()}@test.local`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('register → login → create note → get note', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    token = login.body.token;
    expect(token).toBeDefined();

    const created = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Hello', content: 'This is a test note body.' })
      .expect(201);
    expect(created.body.status).toBe('PENDING');

    await request(app.getHttpServer())
      .get(`/notes/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects unauthenticated access to notes', async () => {
    await request(app.getHttpServer()).get('/notes').expect(401);
  });
});
