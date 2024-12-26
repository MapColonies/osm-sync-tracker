import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { ChangesetController } from '../controllers/changesetController';

export const changesetRouterSymbol = Symbol('changesetRouterSymbol');

export const changesetRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(ChangesetController);

  router.post('', controller.postChangeset);
  router.post('/closure', controller.postChangesetsClosure);
  router.patch('/:changesetId', controller.patchChangeset);
  router.patch('/:changesetId/entities', controller.patchChangesetEntities);
  router.put('/:changesetId/close', controller.putChangeset);
  router.put('/close/_bulk', controller.putChangesets);

  return router;
};
