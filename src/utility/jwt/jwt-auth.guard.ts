import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err) {
      console.error('JWT Auth Guard Error:', err.message || err);
      throw err;
    }
    
    if (!user) {
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;
      console.error('JWT Auth Guard - No user found. Auth header:', authHeader ? 'Present' : 'Missing');
      
      if (info) {
        console.error('JWT Auth Guard Info:', info.message || info);
      }
      
      throw new UnauthorizedException('Invalid or expired token');
    }
    
    return user;
  }
}
