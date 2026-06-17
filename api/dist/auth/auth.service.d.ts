import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
export declare class AuthService {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    register(email: string, password: string): Promise<{
        token: string;
    }>;
    login(email: string, password: string): Promise<{
        token: string;
    }>;
    private tokenFor;
}
