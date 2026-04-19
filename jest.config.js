module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@actions/core$': '<rootDir>/tests/__mocks__/@actions/core.ts',
    '^@actions/github$': '<rootDir>/tests/__mocks__/@actions/github.ts',
  },
};
