import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateStorageBackendDto } from './dto/create-storage-backend.dto';
import { UpdateStorageBackendDto } from './dto/update-storage-backend.dto';
import { StorageBackendsService } from './storage-backends.service';

@Controller('storage-backends')
export class StorageBackendsController {
  constructor(private readonly storageBackendsService: StorageBackendsService) {}

  @Get()
  async list() {
    return {
      success: true,
      data: await this.storageBackendsService.list(),
    };
  }

  @Get(':id')
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.storageBackendsService.findById(id),
    };
  }

  @Post()
  async create(@Body() body: CreateStorageBackendDto) {
    return {
      success: true,
      data: await this.storageBackendsService.create(body),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateStorageBackendDto,
  ) {
    return {
      success: true,
      data: await this.storageBackendsService.update(id, body),
    };
  }

  @Delete(':id')
  async disable(@Param('id', new ParseUUIDPipe()) id: string) {
    return {
      success: true,
      data: await this.storageBackendsService.disable(id),
    };
  }
}
