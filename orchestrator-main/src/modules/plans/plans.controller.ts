import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async list() {
    return {
      success: true,
      data: await this.plansService.list(),
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.plansService.getById(id),
    };
  }

  @Post()
  async create(@Body() body: CreatePlanDto) {
    return {
      success: true,
      data: await this.plansService.create(body),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePlanDto,
  ) {
    return {
      success: true,
      data: await this.plansService.update(id, body),
    };
  }
}
