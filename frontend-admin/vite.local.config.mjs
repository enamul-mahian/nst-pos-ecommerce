import { mergeConfig } from 'vite'
import baseConfig from './vite.config.js'

const resolved = typeof baseConfig === 'function' ? await baseConfig({ command: 'serve', mode: 'development' }) : await baseConfig

export default mergeConfig(resolved, {
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
