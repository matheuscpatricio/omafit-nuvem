import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, 'dist');

// Garantir que o diretório dist existe
mkdirSync(distDir, { recursive: true });

// Copiar index.html (storefront/local preview)
const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Nuvemshop App</title>
</head>
<body>
	<script type="module" src="/main.min.js"></script>
</body>
</html>`;

import { writeFileSync } from 'fs';
writeFileSync(join(distDir, 'index.html'), indexHtml);

// Página da home do app no Admin (usa Nexo: connect + iAmReady para o painel mostrar o iframe)
const appHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Omafit App</title>
	<style>
		body { font-family: Arial, sans-serif; padding: 24px; }
	</style>
</head>
<body>
	<h1>Omafit</h1>
	<p>Home do app ativa.</p>
	<script type="module" src="/home.min.js"></script>
</body>
</html>`;

writeFileSync(join(distDir, 'app.html'), appHtml);

// Criar um manifest.json válido e simples para evitar erros
// (caso o navegador ou Nuvemshop tente carregá-lo automaticamente)
// Removendo propriedades que podem causar problemas com URLs relativas
const manifest = {
	name: "Nuvemshop App",
	short_name: "App",
	display: "standalone"
};

writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('✅ Assets copiados para dist/');
