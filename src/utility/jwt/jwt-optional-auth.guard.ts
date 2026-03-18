import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

/**
 * Optional JWT guard: runs JWT validation when Authorization header is present.
 * Does not throw when token is missing or invalid; request continues with req.user undefined.
 * Use for routes that work for both anonymous and authenticated users (e.g. GET job to set hasApplied).
 */
@Injectable()
export class JwtOptionalAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return true;
    }
    try {
      const result = await super.canActivate(context);
      return result === true || result === undefined ? true : !!result;
    } catch {
      return true;
    }
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      return null;
    }
    return user;
  }
}
