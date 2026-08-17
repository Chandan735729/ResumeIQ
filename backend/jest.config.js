/**
 * Jest Configuration
 * 
 * Configures:
 * - TypeScript support
 * - Path aliases (@services, @modules, etc)
 * - Coverage thresholds (aim for 80%+)
 * - Test file patterns
 */

module.exports = {
  preset: 'ts-jest/presets/default-esm',
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.json',
    },
  },
  testEnvironment: 'node',
  testTimeout: 15000,
  // The DB-backed integration suites (tests/integration/*.integration.test.ts)
  // share one PostgreSQL database and each does a global deleteMany() reset in
  // beforeEach/beforeAll with no per-suite isolation (no schema-per-worker, no
  // transactional wrapping). Jest's default parallel workers are separate
  // processes hitting that same database concurrently, so one suite's reset
  // truncates data another suite's in-flight test depends on, producing
  // order-dependent failures (wrong HTTP status, occasional 500s) that have
  // nothing to do with the code under test. Serializing test files removes the
  // race without introducing per-worker infrastructure (Redis, schema
  // provisioning, etc.), which is out of scope for what these tests need.
  maxWorkers: 1,
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  transformIgnorePatterns: ['/node_modules/(?!pdfjs-dist)'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
