import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: () => 'signed-token' } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('register creates user and returns token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.c' });

    const result = await service.register('a@b.c', 'password123');

    expect(prisma.user.create).toHaveBeenCalled();
    expect(result).toEqual({ token: 'signed-token' });
  });

  it('register throws on duplicate email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    await expect(service.register('a@b.c', 'password123')).rejects.toThrow(ConflictException);
  });
});
