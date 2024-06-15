import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import worker from "@astropub/worker";

import vercel from "@astrojs/vercel/serverless";

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), worker()],
  output: "server",
  adapter: vercel()
});