import { FileProcessingStatus, IngestionFileStage } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IngestionFilesService } from './ingestion-files.service';

describe('IngestionFilesService', () => {
  let service: IngestionFilesService;
  let prisma: {
    ingestionFile: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let fileIngestionQueue: {
    add: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      ingestionFile: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };

    fileIngestionQueue = {
      add: jest.fn(),
    };

    service = new IngestionFilesService(prisma as never, fileIngestionQueue as never);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  const createTempUpload = async (contents: string) => {
    const dir = await mkdtemp(join(tmpdir(), 'ingestion-upload-'));
    const path = join(dir, 'test.csv');
    await writeFile(path, contents);

    return {
      cleanup: () => rm(dir, { recursive: true, force: true }),
      file: {
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: Buffer.byteLength(contents),
        path,
      } as Express.Multer.File,
    };
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('hashes and stores disk-backed uploaded files', async () => {
    const upload = await createTempUpload('date,amount\n2026-05-14,10\n');
    const id = `file-${Date.now()}`;
    const expectedHash = createHash('sha256')
      .update('date,amount\n2026-05-14,10\n')
      .digest('hex');
    const finalStoragePath = join(
      process.cwd(),
      'uploads',
      'ingestion-files',
      `${id}-test.csv`,
    );

    prisma.ingestionFile.create.mockResolvedValue({
      id,
      status: FileProcessingStatus.UPLOADED,
    });
    prisma.ingestionFile.update.mockResolvedValue({
      id,
      status: FileProcessingStatus.QUEUED,
      originalName: 'test.csv',
      sizeBytes: upload.file.size,
      sha256Hash: expectedHash,
    });
    fileIngestionQueue.add.mockResolvedValue({
      id: 'job-1',
    });

    try {
      const result = await service.registerUploadedFile({
        userId: 'user-1',
        file: upload.file,
      });

      expect(prisma.ingestionFile.update).toHaveBeenCalledWith({
        where: {
          id,
        },
        data: expect.objectContaining({
          storagePath: finalStoragePath,
          status: FileProcessingStatus.QUEUED,
          currentStage: IngestionFileStage.QUEUED,
        }),
      });
      await expect(stat(finalStoragePath)).resolves.toBeDefined();
      expect(result).toEqual({
        fileId: id,
        status: FileProcessingStatus.QUEUED,
        queueJobId: 'job-1',
        originalName: 'test.csv',
        sizeBytes: upload.file.size,
        sha256Hash: expectedHash,
      });
    } finally {
      await rm(finalStoragePath, { force: true });
      await upload.cleanup();
    }
  });

  it('allows re-uploading the same file and queues it normally', async () => {
    const upload = await createTempUpload('duplicate');
    const expectedHash = createHash('sha256').update('duplicate').digest('hex');
    const id = `file-${Date.now()}`;
    const finalStoragePath = join(
      process.cwd(),
      'uploads',
      'ingestion-files',
      `${id}-test.csv`,
    );

    prisma.ingestionFile.create.mockResolvedValue({
      id,
      status: FileProcessingStatus.UPLOADED,
    });
    prisma.ingestionFile.update.mockResolvedValue({
      id,
      status: FileProcessingStatus.QUEUED,
      originalName: 'test.csv',
      sizeBytes: upload.file.size,
      sha256Hash: expectedHash,
    });
    fileIngestionQueue.add.mockResolvedValue({
      id: 'job-duplicate',
    });

    try {
      await expect(service.registerUploadedFile({ userId: 'user-1', file: upload.file })).resolves.toEqual({
        fileId: id,
        status: FileProcessingStatus.QUEUED,
        queueJobId: 'job-duplicate',
        originalName: 'test.csv',
        sizeBytes: upload.file.size,
        sha256Hash: expectedHash,
      });
      await expect(stat(finalStoragePath)).resolves.toBeDefined();
    } finally {
      await rm(finalStoragePath, { force: true });
      await upload.cleanup();
    }
  });
});
