export default {
  app: {
    name: "Jutukuva Viewer",
    identifier: "com.jutukuva.viewer",
    version: "1.0.0",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      main: {
        entrypoint: "src/views/main/index.ts",
        external: [],
      },
      overlay: {
        entrypoint: "src/views/overlay/index.ts",
        external: [],
      },
      settings: {
        entrypoint: "src/views/settings/index.ts",
        external: [],
      },
    },
    copy: {
      "src/views/main/index.html": "views/main/index.html",
      "src/views/main/script.js": "views/main/script.js",
      "src/views/main/styles.css": "views/main/styles.css",
      "src/views/overlay/index.html": "views/overlay/index.html",
      "src/views/overlay/script.js": "views/overlay/script.js",
      "src/views/overlay/styles.css": "views/overlay/styles.css",
      "src/views/settings/index.html": "views/settings/index.html",
      "src/views/settings/script.js": "views/settings/script.js",
      "src/views/settings/styles.css": "views/settings/styles.css",
    },
  },
};
