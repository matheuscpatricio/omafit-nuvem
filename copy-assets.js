import { copyFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, "dist");
const assetsDir = join(distDir, "assets");
const buildId = Date.now().toString(36);

mkdirSync(assetsDir, { recursive: true });
copyFileSync(join(distDir, "main.min.js"), join(assetsDir, `main-${buildId}.min.js`));
copyFileSync(join(distDir, "home.min.js"), join(assetsDir, `home-${buildId}.min.js`));
copyFileSync(join(distDir, "widget.min.js"), join(assetsDir, `widget-${buildId}.min.js`));
copyFileSync(join(distDir, "storefront-legacy.min.js"), join(assetsDir, `storefront-legacy-${buildId}.min.js`));

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
  <script type="module" src="/assets/main-${buildId}.min.js"></script>
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
  <script type="module">
    const omafitDebugLog = (message, data, hypothesisId = "H1") => {
      // #region agent log
      fetch('http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b68c2f'},body:JSON.stringify({sessionId:'b68c2f',runId:'pre-fix',hypothesisId,location:'app.html:inline',message,data,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    };

    const homeModuleUrl = \`/assets/home-${buildId}.min.js?debug=b68c2f-v2\`;
    omafitDebugLog("app_html_boot", {
      href: window.location.href,
      userAgent: navigator.userAgent,
      homeModuleUrl,
      clientId: new URLSearchParams(window.location.search).get("client_id") || new URLSearchParams(window.location.search).get("clientId") || null,
    }, "H1");

    window.addEventListener("error", (event) => {
      omafitDebugLog("window_error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }, "H3");
    });

    window.addEventListener("unhandledrejection", (event) => {
      omafitDebugLog("unhandled_rejection", {
        reason: String(event.reason),
      }, "H3");
    });

    import(homeModuleUrl)
      .then(() => {
        omafitDebugLog("home_module_import_success", {
          homeModuleUrl,
        }, "H1");
      })
      .catch((error) => {
        omafitDebugLog("home_module_import_failure", {
          homeModuleUrl,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
        }, "H2");
      });
  </script>
</body>
</html>`;

writeFileSync(join(distDir, "app.html"), appHtml);

const widgetHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Omafit Widget</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      background: #f8fafc;
    }

    #app {
      min-height: 100vh;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/assets/widget-${buildId}.min.js"></script>
</body>
</html>`;

writeFileSync(join(distDir, "widget.html"), widgetHtml);

// Criar um manifest.json valido e simples para evitar erros.
const manifest = {
  name: "Omafit Nuvemshop",
  short_name: "Omafit",
  display: "standalone"
};

writeFileSync(join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log("Assets copiados para dist/");
