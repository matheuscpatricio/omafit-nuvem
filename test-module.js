// Teste simples para verificar se o módulo está sendo exportado corretamente
import('./dist/main.min.js')
	.then(module => {
		console.log('✅ Módulo carregado com sucesso!');
		console.log('Exports:', Object.keys(module));
		if (module.App) {
			console.log('✅ Função App encontrada!');
			console.log('Tipo:', typeof module.App);
		} else {
			console.log('❌ Função App NÃO encontrada!');
		}
	})
	.catch(err => {
		console.error('❌ Erro ao carregar módulo:', err);
	});
