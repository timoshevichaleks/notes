import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface AuthedRequest {
  user: { userId: string; email: string };
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthedRequest>();
  return request.user;
});
