import { Application } from 'express';
import { DependencyContainer } from 'tsyringe';
import { RegisterOptions, registerExternalValues } from './containerConfig';
import { ServerBuilder } from './serverBuilder';

async function getApp(registerOptions?: RegisterOptions): Promise<{ app: Application; container: DependencyContainer }> {
  const container = await registerExternalValues(registerOptions);
  const app = container.resolve(ServerBuilder).build();
  return { app, container };
}

export { getApp };
