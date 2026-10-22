import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller('')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness check (no dependencies)' })
  healthCheck() {
    return this.appService.healthCheck();
  }

  @Get('health')
  @ApiOperation({ summary: 'Readiness check (verifies the database)' })
  readiness() {
    return this.appService.readiness();
  }
}
