/** @type {import('jest').Config} */
module.exports = {
    // 1️⃣  use the preset (keeps TS diagnostics, source-maps, etc.)
    preset: 'ts-jest',
  
    testEnvironment: 'jsdom',
  
    // 2️⃣  tell Jest to transform .ts/.tsx with ts-jest
    transform: {
      '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
    },
  
    // 3️⃣  (optional, but removes the deprecation warning)
    //     drop the old  "globals: { 'ts-jest': { … } }" block
  
    setupFiles: ['<rootDir>/jest.canvasMock.js'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  
    moduleNameMapper: {
      '\\.(css|scss|sass|less)$': 'identity-obj-proxy',
      '^canvas$': 'identity-obj-proxy',
    },
  };