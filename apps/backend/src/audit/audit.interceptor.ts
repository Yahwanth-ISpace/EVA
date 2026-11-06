import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type AuthedRequest = Request & { user?: { userId?: string; role?: string } };

/** Records every mutating request made with a user session. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!MUTATING.has(req.method.toUpperCase())) return next.handle();

    const write = (statusCode: number, outcome: 'success' | 'failure' | 'denied') => {
      const user = req.user;
      if (!user?.userId) return;
      const routePath = (req.route as { path?: string } | undefined)?.path;
      void this.audit.record({
        action: `${req.method.toUpperCase()} ${routePath ?? req.path}`,
        outcome,
        actorId: user.userId,
        actorRole: user.role ?? null,
        targetId: typeof req.params?.id === 'string' ? req.params.id : null,
        method: req.method.toUpperCase(),
        path: req.originalUrl?.split('?')[0] ?? req.path,
        statusCode,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          write(res.statusCode, 'success');
        },
        error: (err: unknown) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          write(status, status === 403 ? 'denied' : 'failure');
        },
      }),
    );
  }
}
