import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Vitest owns tests/**; test/corpus/** uses node:test (zero-dependency corpus scripts).
export default mergeConfig(viteConfig, defineConfig({ test: { include: ['tests/**/*.test.ts'] } }))
