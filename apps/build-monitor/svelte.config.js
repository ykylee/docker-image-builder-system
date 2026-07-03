import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Svelte 5 는 runes 가 default-on, 별도 flag 불필요
  }
};
