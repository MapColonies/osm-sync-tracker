import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { EntityController } from '../../entity/controllers/entityController';
import { FileController } from '../controllers/fileController';

export const fileRouterSymbol = Symbol('fileRouterFactory');

export const fileRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(EntityController);
  const fileController = dependencyContainer.resolve(FileController);

  router.get('/tryCloseOpenPossibleFiles', fileController.tryCloseOpenPossibleFiles);
  router.post('/:fileId/entity', controller.postEntity);
  router.post('/:fileId/entity/_bulk', controller.postEntities);
  router.patch('/:fileId/entity/:entityId', controller.patchEntity);

  return router;
};
