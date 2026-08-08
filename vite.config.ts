import { defineConfig } from "vite";

export default defineConfig({
  base: "/jsonview/",
  server: {
    port: 4321,
    strictPort: true,
  },
});
