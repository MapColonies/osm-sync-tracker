import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { EntityController } from '../../entity/controllers/entityController';
import { FileController } from '../controllers/fileController';

export const fileRouterSymbol = Symbol('fileRouterFactory');

export const fileRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const entityController = dependencyContainer.resolve(EntityController);
  const fileController = dependencyContainer.resolve(FileController);

  router.post('/closure', fileController.postFilesClosure);
  router.post('/:fileId/entity', entityController.postEntity);
  router.post('/:fileId/entity/_bulk', entityController.postEntities);
  router.patch('/:fileId/entity/:entityId', entityController.patchEntity);

  return router;
};
