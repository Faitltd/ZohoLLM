import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/kit/vite';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    files: {
      assets: 'static',
      lib: 'src/lib',
      routes: 'src/routes',
      appTemplate: 'src/app.html'
    }
  }
};

export default config;
