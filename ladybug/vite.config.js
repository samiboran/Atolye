import { defineConfig } from 'vite';

// Served from https://<user>.github.io/Atolye/ladybug/ via GitHub Pages
// (see .github/workflows/deploy.yml) - asset URLs need this prefix so they
// resolve correctly under that subpath instead of domain root.
export default defineConfig({
  base: '/Atolye/ladybug/',
});
