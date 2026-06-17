import { AuthService } from './auth.service';
import { AuthDto } from './dto/auth.dto';
export declare class AuthController {
    private auth;
    constructor(auth: AuthService);
    register(dto: AuthDto): Promise<{
        token: string;
    }>;
    login(dto: AuthDto): Promise<{
        token: string;
    }>;
}
