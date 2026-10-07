import { defineConfig } from "vite";

export default defineConfig({
  // Her AiProjects projesi kendine ayrı, sabit port alır; strictPort sessizce kaymayı engeller.
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
  preview: { host: "127.0.0.1", port: 4197, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 700, // three tek başına ~530 kB
    rolldownOptions: {
      output: {
        // Vite 8 = Rolldown: manualChunks yerine codeSplitting.groups.
        codeSplitting: {
          groups: [{ name: "three", test: /[\\/]node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
