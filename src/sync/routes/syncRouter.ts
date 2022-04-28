import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { FileController } from '../../file/controllers/fileController';
import { SyncController } from '../controllers/syncController';

export const syncRouterSymbol = Symbol('syncRouterFactory');

export const syncRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const syncController = dependencyContainer.resolve(SyncController);
  const fileController = dependencyContainer.resolve(FileController);

  router.post('/', syncController.postSync);
  router.get('/latest', syncController.getLatestSync);
  router.patch('/:syncId', syncController.patchSync);

  router.post('/:syncId/file', fileController.postFile);
  router.post('/:syncId/file/_bulk', fileController.postFiles);
  router.post('/:syncId/rerun', syncController.rerunSync);

  return router;
};
