import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import mime from 'mime-types';
import { SERVICES } from '../../common/constants';
import { File, FileUpdate } from '../models/file';
import { FileManager } from '../models/fileManager';
import { HttpError } from '../../common/errors';
import { ConflictingRerunFileError, DuplicateFilesError, FileAlreadyExistsError, FileNotFoundError } from '../models/errors';
import { SyncNotFoundError } from '../../sync/models/errors';
import { ExceededNumberOfRetriesError } from '../../changeset/models/errors';

type PostFileHandler = RequestHandler<{ syncId: string }, string, File>;
type PostFilesHandler = RequestHandler<{ syncId: string }, string, File[]>;
type PatchFileHandler = RequestHandler<{ syncId: string; fileId: string }, string[], FileUpdate>;
type GetTryCloseFilesHandler = RequestHandler<undefined, string[], undefined>;

const txtplain = mime.contentType('text/plain') as string;

@injectable()
export class FileController {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, private readonly manager: FileManager) {}

  public postFile: PostFileHandler = async (req, res, next) => {
    try {
      await this.manager.createFile(req.params.syncId, req.body);
      return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof FileAlreadyExistsError || error instanceof ConflictingRerunFileError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      } else if (error instanceof SyncNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public postFiles: PostFilesHandler = async (req, res, next) => {
    try {
      await this.manager.createFiles(req.params.syncId, req.body);
      return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof FileAlreadyExistsError || error instanceof DuplicateFilesError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      } else if (error instanceof SyncNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public patchFile: PatchFileHandler = async (req, res, next) => {
    const { syncId, fileId } = req.params;
    try {
      const completedSyncIds = await this.manager.updateFile(syncId, fileId, req.body);
      return res.status(httpStatus.OK).json(completedSyncIds);
    } catch (error) {
      if (error instanceof SyncNotFoundError || error instanceof FileNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      if (error instanceof ExceededNumberOfRetriesError) {
        this.logger.warn({ err: error, msg: 'could not attempt to close file, number of retries exceeded', syncId, fileId });
      }
      return next(error);
    }
  };

  public tryCloseOpenPossibleFiles: GetTryCloseFilesHandler = async (req, res, next) => {
    try {
      const fileIds = await this.manager.tryCloseOpenPossibleFiles();
      return res.status(httpStatus.OK).json(fileIds);
    } catch (error) {
      return next(error);
    }
  };
}
