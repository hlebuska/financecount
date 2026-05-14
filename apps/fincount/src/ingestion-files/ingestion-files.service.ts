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
import { FileProcessingStatus, IngestionIssueSeverity, IngestionIssueType } from '@prisma/client';
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

    await mkdir(this.uploadDir, { recursive: true });

    const fileContents = await readFile(file.path);
    const sha256Hash = createHash('sha256').update(fileContents).digest('hex');

    const duplicate = await this.prisma.ingestionFile.findFirst({
      where: {
        userId,
        sha256Hash,
        status: {
          notIn: [
            FileProcessingStatus.DUPLICATE_FILE,
            FileProcessingStatus.FAILED,
          ],
        },
      },
    });

    if (duplicate) {
      await unlink(file.path).catch(() => undefined);

      const duplicateRecord = await this.prisma.ingestionFile.create({
        data: {
          userId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          extension: extname(file.originalname).replace('.', '').toLowerCase() || null,
          sizeBytes: file.size,
          sha256Hash,
          storagePath: duplicate.storagePath,
          status: FileProcessingStatus.DUPLICATE_FILE,
          errorMessage: `Duplicate of file ${duplicate.id}`,
          issues: {
            create: {
              severity: IngestionIssueSeverity.INFO,
              type: IngestionIssueType.DUPLICATE_FILE,
              message: 'This exact file was already uploaded.',
              details: {
                duplicateOfFileId: duplicate.id,
              },
            },
          },
        },
      });

      return {
        fileId: duplicateRecord.id,
        status: duplicateRecord.status,
        duplicateOfFileId: duplicate.id,
      };
    }

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
          errorMessage: error instanceof Error ? error.message : 'Unknown upload error',
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
      },
    });

    if (!file) {
      throw new BadRequestException('File not found.');
    }

    return file;
  }
}
