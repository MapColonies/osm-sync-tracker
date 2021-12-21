import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { EntityController } from '../controllers/entityController';

export const entityRouterSymbol = Symbol('entityRouterSymbol');

export const entityRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(EntityController);

  router.patch('/_bulk', controller.patchEntities);

  return router;
};
