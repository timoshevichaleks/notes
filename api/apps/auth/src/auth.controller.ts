import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AUTH_PATTERNS } from '@app/contracts';
import type { AuthCredentials } from '@app/contracts';
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
