import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AUTH_SERVICE, AUTH_PATTERNS } from '@app/contracts';
import { AuthDto } from './dto/auth.dto';
import { callService } from './rpc.util';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private auth: ClientProxy) {}

  @Post('register')
  register(@Body() dto: AuthDto) {
    return callService(this.auth.send(AUTH_PATTERNS.register, dto));
  }

  @Post('login')
  login(@Body() dto: AuthDto) {
    return callService(this.auth.send(AUTH_PATTERNS.login, dto));
  }
}
