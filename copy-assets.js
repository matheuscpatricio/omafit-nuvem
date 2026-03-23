import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, "dist");

// Garantir que o diretorio dist existe
mkdirSync(distDir, { recursive: true });

// Copiar index.html (storefront/local preview)
const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Omafit Nuvemshop</title>
  <style>
    body {
      margin: 0;
      font-family: Inter, Arial, sans-serif;
      background: #f5f7fb;
    }
  </style>
</head>
<body>
  <script type="module" src="/main.min.js"></script>
</body>
</html>`;

writeFileSync(join(distDir, "index.html"), indexHtml);

// Pagina da home do app no Admin.
const appHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Omafit App</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      background: #f5f7fb;
      font-family: Inter, Arial, sans-serif;
    }

    #app {
      min-height: 100vh;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/home.min.js"></script>
</body>
</html>`;

writeFileSync(join(distDir, "app.html"), appHtml);

// Criar um manifest.json valido e simples para evitar erros.
const manifest = {
  name: "Omafit Nuvemshop",
  short_name: "Omafit",
  display: "standalone"
};

writeFileSync(join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log("Assets copiados para dist/");
