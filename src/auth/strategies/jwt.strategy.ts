import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { getAppConfig } from '../../config/app.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getAppConfig().jwt.accessSecret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub: string; email: string; tv?: number }) {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, tokenVersion: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    // Tokens issued before versioning existed carry no `tv` (= version 0).
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Token is no longer valid');
    }

    return { userId: user.id, email: user.email };
  }
}
