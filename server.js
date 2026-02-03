import { createServer } from 'http';
import { readFileSync, statSync, createReadStream } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 8080;
const DIST_DIR = join(__dirname, 'dist');

const MIME_TYPES = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.webmanifest': 'application/manifest+json',
};

const CSP_HEADER = "frame-ancestors 'self' *.mitiendanube.com:* *.lojavirtualnuvem.com.br:* cirrus.tiendanube.com:* *.tiendanube.com:* *.nuvemshop.com.br:* tn.panel.vici.la platform.twitter.com:* ct.pinterest.com:* *.pintergration.com:* bat.bing.com:* dev.visualwebsiteoptimizer.com:* *.doubleclick.net:* *.getbeamer.com:* *.myperfit.net:* *.mercadolibre.com:* *.cloudflare.com:*";

const server = createServer((req, res) => {
	// Log de requisições para debug
	const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
	console.log(`[${new Date().toISOString()}] ${req.method} ${urlPath}`);
	
	// Configurar headers CORS e CSP
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	res.setHeader('Content-Security-Policy', CSP_HEADER);
	// Não definir X-Frame-Options para permitir iframe no painel Nuvemshop (CSP frame-ancestors controla)

	if (req.method === 'OPTIONS') {
		res.writeHead(200);
		res.end();
		return;
	}

	// urlPath já foi definido acima para logging
	
	// Se for manifest.json, retornar 404 para evitar que o navegador tente carregá-lo
	// (os erros de manifest vêm da própria Nuvemshop, não do nosso servidor)
	if (urlPath === '/manifest.json') {
		res.writeHead(404);
		res.end('Not found');
		return;
	}
	
	let filePath = join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);

	// Prevenir path traversal
	if (!filePath.startsWith(DIST_DIR)) {
		res.writeHead(403);
		res.end('Forbidden');
		return;
	}

	try {
		const stats = statSync(filePath);
		
		if (stats.isDirectory()) {
			filePath = join(filePath, 'index.html');
		}

		const ext = extname(filePath);
		let contentType = MIME_TYPES[ext] || 'application/octet-stream';
		
		// Para arquivos JavaScript, garantir que o Content-Type está correto para módulos ES6
		if (ext === '.js') {
			contentType = 'application/javascript; charset=utf-8';
		}

		res.setHeader('Content-Type', contentType);
		// Adicionar cache headers para melhor performance
		if (ext === '.js' || ext === '.css') {
			res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
		}
		res.writeHead(200);
		
		createReadStream(filePath).pipe(res);
	} catch (err) {
		if (err.code === 'ENOENT') {
			// Se o arquivo não existe, tentar servir main.min.js como fallback
			if (urlPath === '/' || urlPath.endsWith('.js')) {
				const jsPath = join(DIST_DIR, 'main.min.js');
				try {
					const jsStats = statSync(jsPath);
					res.setHeader('Content-Type', 'application/javascript');
					res.writeHead(200);
					createReadStream(jsPath).pipe(res);
					return;
				} catch (jsErr) {
					// Se main.min.js também não existir, retornar 404
				}
			}
			res.writeHead(404);
			res.end('File not found');
		} else {
			res.writeHead(500);
			res.end('Server error');
		}
	}
});

server.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}/`);
});

