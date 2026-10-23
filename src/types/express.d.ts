// What passport puts on `req.user` after JwtStrategy / LocalStrategy.
declare global {
  namespace Express {
    interface User {
      userId: string;
      email: string;
      tokenVersion?: number;
    }
  }
}

export {};
