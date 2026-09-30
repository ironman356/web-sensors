import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [basicSsl()],
  server: {
    host: true,
    open: '/',
  },
})
