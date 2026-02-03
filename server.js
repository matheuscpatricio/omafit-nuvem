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
};

const CSP_HEADER = "frame-ancestors 'self' *.mitiendanube.com:* *.lojavirtualnuvem.com.br:* cirrus.tiendanube.com:* *.tiendanube.com:* *.nuvemshop.com.br:* tn.panel.vici.la platform.twitter.com:* ct.pinterest.com:* *.pintergration.com:* bat.bing.com:* dev.visualwebsiteoptimizer.com:* *.doubleclick.net:* *.getbeamer.com:* *.myperfit.net:* *.mercadolibre.com:* *.cloudflare.com:*";

const server = createServer((req, res) => {
	// Configurar headers CORS e CSP
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	res.setHeader('Content-Security-Policy', CSP_HEADER);

	if (req.method === 'OPTIONS') {
		res.writeHead(200);
		res.end();
		return;
	}

	let filePath = join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);

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
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';

		res.setHeader('Content-Type', contentType);
		res.writeHead(200);
		
		createReadStream(filePath).pipe(res);
	} catch (err) {
		if (err.code === 'ENOENT') {
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

