import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tinyland-fingerprint',
    globals: true,
    environment: 'node',
  },
});
