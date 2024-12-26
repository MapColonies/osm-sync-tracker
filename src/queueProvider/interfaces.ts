export interface Identifiable {
  [property: string]: unknown;
  id: string;
}

export interface JobQueueProvider<T> {
  activeQueueName: string;
  push: (jobs: T[]) => Promise<void>;
  shutdown: () => Promise<void>;
}
