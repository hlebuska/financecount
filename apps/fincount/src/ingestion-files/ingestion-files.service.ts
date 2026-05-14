import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DbService } from '@app/db';
import { FileProcessingStatus, IngestionIssueSeverity, IngestionIssueType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';

@Injectable()
export class IngestionFilesService {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'ingestion-files');

  constructor(private readonly prisma: DbService) {}

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
          not: FileProcessingStatus.DUPLICATE_FILE,
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

      return {
        fileId: updated.id,
        status: updated.status,
        originalName: updated.originalName,
        sizeBytes: updated.sizeBytes,
        sha256Hash: updated.sha256Hash,
      };
    } catch (error) {
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
