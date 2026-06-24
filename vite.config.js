import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — cached forever, changes rarely
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client
          'vendor-supabase': ['@supabase/supabase-js'],
          // Date utilities
          'vendor-datefns': ['date-fns'],
          // Icon library — large, changes rarely
          'vendor-lucide': ['lucide-react'],
        },
      },
    },
    // Raise the chunk size warning threshold slightly
    chunkSizeWarningLimit: 600,
  },
})
