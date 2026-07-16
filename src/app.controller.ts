import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  index(): string {
    return 'Management API';
  }
}
