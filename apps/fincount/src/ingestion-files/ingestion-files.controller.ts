import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { IngestionFilesService } from './ingestion-files.service';

@Controller('ingestion-files')
export class IngestionFilesController {
  constructor(private readonly ingestionFilesService: IngestionFilesService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, callback) => {
          const uniqueName = `${Date.now()}-${Math.round(
            Math.random() * 1_000_000_000,
          )}-${file.originalname}`;

          callback(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.ingestionFilesService.registerUploadedFile({
      userId: 'demo-user',
      file,
    });
  }

  @Get()
  findMany() {
    return this.ingestionFilesService.findMany('demo-user');
  }

  @Get(':fileId')
  findOne(@Param('fileId') fileId: string) {
    return this.ingestionFilesService.findOne('demo-user', fileId);
  }
}