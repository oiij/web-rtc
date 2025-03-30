import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src/index.ts', './src/node.ts', 'src/class.ts'],
  clean: true,
  format: ['cjs', 'esm'],
  external: ['vue'],
  dts: true,
  minify: false,
})
