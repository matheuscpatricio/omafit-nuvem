import { spawn } from 'child_process';
import { request } from 'http';

const PORT = 8080;

console.log('\n🔄 Iniciando tunnel público com Cloudflare...\n');
console.log('💡 IMPORTANTE: Use a URL do JavaScript (/main.min.js) na Nuvemshop, não a URL raiz!\n');
console.log('⏳ Aguardando servidor local estar pronto...\n');

// Função para verificar se o servidor está respondendo
function waitForServer(maxAttempts = 10) {
	return new Promise((resolve) => {
		let attempts = 0;
		
		const checkServer = () => {
			const req = request({
				hostname: 'localhost',
				port: PORT,
				path: '/',
				method: 'HEAD',
				timeout: 1000
			}, (res) => {
				console.log('✅ Servidor local está respondendo!\n');
				resolve(true);
			});
			
			req.on('error', () => {
				attempts++;
				if (attempts < maxAttempts) {
					setTimeout(checkServer, 1000);
				} else {
					console.log('⚠️  Servidor pode não estar pronto, mas continuando mesmo assim...\n');
					resolve(false);
				}
			});
			
			req.on('timeout', () => {
				req.destroy();
				attempts++;
				if (attempts < maxAttempts) {
					setTimeout(checkServer, 1000);
				} else {
					console.log('⚠️  Servidor pode não estar pronto, mas continuando mesmo assim...\n');
					resolve(false);
				}
			});
			
			req.end();
		};
		
		checkServer();
	});
}

// Aguardar servidor estar pronto
await waitForServer();

// Usar cloudflared (Cloudflare Tunnel) que não requer senha
const tunnel = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], {
	stdio: ['ignore', 'pipe', 'pipe'],
	shell: true
});

let url = '';
let stdoutBuffer = '';
let stderrBuffer = '';
let urlCheckTimeout = null;

function extractUrl(text) {
	// cloudflared retorna URLs no formato: https://xxxxx.trycloudflare.com
	const tryCloudflarePattern = /https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g;
	const tryCloudflareMatches = text.match(tryCloudflarePattern);
	if (tryCloudflareMatches && tryCloudflareMatches.length > 0) {
		return tryCloudflareMatches[0].trim();
	}
	
	return null;
}

function displayUrl(foundUrl) {
	if (url) return; // Já exibimos
	
	url = foundUrl;
	if (urlCheckTimeout) {
		clearTimeout(urlCheckTimeout);
		urlCheckTimeout = null;
	}
	
	console.log('\n' + '='.repeat(60));
	console.log('✅ URL pública gerada!');
	console.log('='.repeat(60));
	console.log(`🌐 URL base: ${url}`);
	console.log(`📦 URL do JavaScript: ${url}/main.min.js`);
	console.log('');
	console.log('📋 ⚠️  IMPORTANTE: Use esta URL na Nuvemshop:');
	console.log(`   ${url}/main.min.js`);
	console.log('');
	console.log('   (Use a URL do JS, não a URL raiz!)');
	console.log('='.repeat(60));
	console.log('\n⚠️  Pressione Ctrl+C para encerrar o tunnel\n');
}

function checkAndDisplayUrl(text, source) {
	if (url) return; // Já encontramos a URL
	
	const foundUrl = extractUrl(text);
	if (foundUrl) {
		displayUrl(foundUrl);
	}
}

// Timeout para verificar se a URL aparece após alguns segundos
urlCheckTimeout = setTimeout(() => {
	if (!url) {
		console.log('\n⚠️  URL ainda não detectada. Verifique o output acima.');
		console.log('💡 A URL geralmente aparece após "Registered tunnel connection"');
		console.log('💡 Procure por uma linha com "trycloudflare.com"\n');
	}
}, 5000);

tunnel.stdout.on('data', (data) => {
	const output = data.toString();
	process.stdout.write(output);
	
	stdoutBuffer += output;
	// Verificar a cada linha completa
	const lines = stdoutBuffer.split('\n');
	stdoutBuffer = lines.pop() || ''; // Manter última linha incompleta no buffer
	
	lines.forEach(line => {
		checkAndDisplayUrl(line, 'stdout');
	});
	
	// Também verificar o buffer completo (caso a URL esteja em múltiplas linhas)
	if (!url) {
		checkAndDisplayUrl(stdoutBuffer, 'stdout-buffer');
	}
});

tunnel.stderr.on('data', (data) => {
	const output = data.toString();
	// cloudflared escreve informações importantes no stderr também
	process.stderr.write(output);
	
	stderrBuffer += output;
	// Verificar a cada linha completa
	const lines = stderrBuffer.split('\n');
	stderrBuffer = lines.pop() || ''; // Manter última linha incompleta no buffer
	
	lines.forEach(line => {
		checkAndDisplayUrl(line, 'stderr');
	});
	
	// Também verificar o buffer completo (caso a URL esteja em múltiplas linhas)
	if (!url) {
		checkAndDisplayUrl(stderrBuffer, 'stderr-buffer');
	}
});

tunnel.on('close', (code) => {
	if (code !== 0 && code !== null) {
		console.error(`\n❌ Tunnel encerrado com código ${code}`);
	} else {
		console.log('\n❌ Tunnel fechado');
	}
	process.exit(code || 0);
});

process.on('SIGINT', () => {
	tunnel.kill('SIGINT');
});
