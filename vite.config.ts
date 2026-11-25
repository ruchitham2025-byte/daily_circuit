import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwind(),
    ...(command === 'build'
      ? [
          devvit({
            client: {
              build: {
                rollupOptions: {
                  onwarn(warning, defaultHandler) {
                    // React Server Component markers do not apply to the iframe client.
                    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
                    defaultHandler(warning);
                  },
                },
              },
            },
          }),
        ]
      : []),
  ],
}));
