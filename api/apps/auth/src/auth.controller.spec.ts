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
