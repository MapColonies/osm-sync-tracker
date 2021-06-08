import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { Services } from '../../common/constants';
import { File } from '../models/file';
import { FileManager } from '../models/fileManager';
import { HttpError } from '../../common/errors';
import { DuplicateFilesError, FileAlreadyExistsError } from '../models/errors';
import { SyncNotFoundError } from '../../sync/models/errors';

type PostFileHandler = RequestHandler<{ syncId: string }, string, File>;
type PostFilesHandler = RequestHandler<{ syncId: string }, string, File[]>;

@injectable()
export class FileController {
  public constructor(@inject(Services.LOGGER) private readonly logger: Logger, private readonly manager: FileManager) {}

  public postFile: PostFileHandler = async (req, res, next) => {
    try {
      await this.manager.createFile(req.params.syncId, req.body);
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof FileAlreadyExistsError) {
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
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof FileAlreadyExistsError || error instanceof DuplicateFilesError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      } else if (error instanceof SyncNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };
}
