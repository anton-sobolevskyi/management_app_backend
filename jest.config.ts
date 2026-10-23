/** @type {import('jest').Config} */
const config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: '../coverage',
  verbose: true,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!@nestjs/)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  testEnvironment: 'node',
  // Floors a bit below current coverage: they stop regressions, not progress
  coverageThreshold: {
    global: { statements: 82, branches: 77, functions: 83, lines: 83 },
  },
  coveragePathIgnorePatterns: ['/node_modules/', '/src/generated/'],
};

export default config;
