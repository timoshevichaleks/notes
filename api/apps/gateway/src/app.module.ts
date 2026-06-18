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
