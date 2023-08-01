module.exports = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
  coverageReporters: ['text', 'html'],
  collectCoverage: true,
  setupFilesAfterEnv: ['<rootDir>/tests/matchers.js'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!*/node_modules/',
    '!/vendor/**',
    '!*/common/**',
    '!**/models/**',
    '!**/app.ts',
    '!**/containerConfig.ts',
    '!**/index.ts',
    '!**/serverBuilder.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  rootDir: '../../../.',
  testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
  setupFiles: ['<rootDir>/tests/configurations/jest.setup.ts'],
  setupFilesAfterEnv: ['jest-openapi', '<rootDir>/tests/configurations/initJestOpenapi.setup.ts'],
  globalTeardown: '<rootDir>/tests/configurations/jest.globalTeardown.ts',
  reporters: [
    'default',
    [
      'jest-html-reporters',
      { multipleReportsUnitePath: './reports', pageTitle: 'integration', publicPath: './reports', filename: 'integration.html' },
    ],
  ],
  moduleDirectories: ['node_modules', 'src'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -20,
    },
  },
};
