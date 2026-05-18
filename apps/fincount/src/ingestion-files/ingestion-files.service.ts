import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { DbService } from '@app/db';
import {
  FILE_INGESTION_QUEUE,
  PROCESS_INGESTION_FILE_JOB,
  ProcessIngestionFileJobPayload,
} from '@app/contracts';
import {
  FileProcessingStatus,
  IngestionFileStage,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';

@Injectable()
export class IngestionFilesService {
  private readonly logger = new Logger(IngestionFilesService.name);
  private readonly uploadDir = join(process.cwd(), 'uploads', 'ingestion-files');

  constructor(
    private readonly prisma: DbService,
    @InjectQueue(FILE_INGESTION_QUEUE)
    private readonly fileIngestionQueue: Queue<ProcessIngestionFileJobPayload>,
  ) {}

  async registerUploadedFile(params: {
    userId: string;
    file: Express.Multer.File;
  }) {
    const { userId, file } = params;

    if (!file) {
      throw new BadRequestException('File is required.');
    }

    if (!this.isPdfUpload(file)) {
      if (file.path) {
        await unlink(file.path).catch(() => undefined);
      }

      throw new BadRequestException('Only PDF files are supported.');
    }

    await mkdir(this.uploadDir, { recursive: true });

    const fileContents = await readFile(file.path);
    const sha256Hash = createHash('sha256').update(fileContents).digest('hex');

    const created = await this.prisma.ingestionFile.create({
      data: {
        userId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        extension: extname(file.originalname).replace('.', '').toLowerCase() || null,
        sizeBytes: file.size,
        sha256Hash,
        storagePath: 'pending',
        status: FileProcessingStatus.UPLOADED,
        currentStage: IngestionFileStage.UPLOADING,
        currentStageMessage: 'Preparing uploaded file for processing.',
        processingEvents: {
          create: {
            stage: IngestionFileStage.UPLOADING,
            message: 'Upload received and stored temporarily.',
          },
        },
      },
    });

    const finalStoragePath = join(this.uploadDir, `${created.id}-${file.originalname}`);

    try {
      await rename(file.path, finalStoragePath);

      const updated = await this.prisma.ingestionFile.update({
        where: {
          id: created.id,
        },
        data: {
          storagePath: finalStoragePath,
          status: FileProcessingStatus.QUEUED,
          currentStage: IngestionFileStage.QUEUED,
          currentStageMessage: 'File queued for processing.',
          processingEvents: {
            create: {
              stage: IngestionFileStage.QUEUED,
              message: 'File saved and added to the processing queue.',
            },
          },
        },
      });

      const job = await this.fileIngestionQueue.add(
        PROCESS_INGESTION_FILE_JOB,
        {
          fileId: updated.id,
        },
        {
          jobId: `process-ingestion-file-${updated.id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      await this.prisma.ingestionFile.update({
        where: {
          id: updated.id,
        },
        data: {
          queueJobId: job.id,
        },
      });

      return {
        fileId: updated.id,
        status: updated.status,
        queueJobId: job.id,
        originalName: updated.originalName,
        sizeBytes: updated.sizeBytes,
        sha256Hash: updated.sha256Hash,
      };
    } catch (error) {
      this.logger.error(
        'Failed to save uploaded file.',
        error instanceof Error ? error.stack : String(error),
      );

      await this.prisma.ingestionFile.update({
        where: {
          id: created.id,
        },
        data: {
          status: FileProcessingStatus.FAILED,
          currentStage: IngestionFileStage.FAILED,
          currentStageMessage: 'Failed before processing could start.',
          errorMessage: error instanceof Error ? error.message : 'Unknown upload error',
          processingEvents: {
            create: {
              stage: IngestionFileStage.FAILED,
              message: 'The upload could not be saved for processing.',
            },
          },
        },
      });

      if (file.path) {
        await unlink(file.path).catch(() => undefined);
      }

      throw new InternalServerErrorException('Failed to save uploaded file.');
    }
  }

  async findMany(userId: string) {
    return this.prisma.ingestionFile.findMany({
      where: {
        userId,
      },
      orderBy: {
        uploadedAt: 'desc',
      },
      include: {
        issues: true,
        processingEvents: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 6,
        },
      },
    });
  }

  async findOne(userId: string, fileId: string) {
    const file = await this.prisma.ingestionFile.findFirst({
      where: {
        id: fileId,
        userId,
      },
      include: {
        issues: true,
        rawTransactions: true,
        processingEvents: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!file) {
      throw new BadRequestException('File not found.');
    }

    return file;
  }

  private isPdfUpload(file: Express.Multer.File) {
    const extension = extname(file.originalname).toLowerCase();

    return file.mimetype === 'application/pdf' || extension === '.pdf';
  }
}
