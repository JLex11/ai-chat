import { defineConfig } from "astro/config";

import tailwind from "@astrojs/tailwind";
import worker from "@astropub/worker";

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), worker()],
});
