import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { Observable, firstValueFrom } from 'rxjs';
import type { RpcErrorShape } from '@app/contracts';

// Awaits an RPC call and re-maps a domain error (carrying statusCode) back to an HTTP error.
export async function callService<T>(obs$: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(obs$);
  } catch (err) {
    const e = err as RpcErrorShape;
    const status = e?.statusCode ?? e?.status;
    if (typeof status === 'number') {
      throw new HttpException(e.message ?? 'Error', status);
    }
    throw new InternalServerErrorException('Upstream service error');
  }
}
