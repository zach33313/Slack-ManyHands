/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        module: 'CommonJS',
        moduleResolution: 'node',
        strict: true,
        skipLibCheck: true,
        paths: { '@/*': ['./*'] },
      },
    }],
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.server.json',
    }],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
};
