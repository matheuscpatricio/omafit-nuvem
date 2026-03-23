/** @jsxImportSource @tiendanube/nube-sdk-jsx */
import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import { Column, Text } from "@tiendanube/nube-sdk-jsx";

export function App(nube: NubeSDK) {
	const store = nube.getState().store;
	nube.render(
		"app_settings" as never,
		<Column gap="8px">
			<Text>Omafit conectado ao ambiente administrativo da Nuvemshop.</Text>
			<Text>Loja: {store.name}</Text>
			<Text>Store ID: {String(store.id)}</Text>
			<Text>
				Use o painel integrado do app para gerenciar billing, widget, analytics e tabelas de
				medidas.
			</Text>
		</Column>,
	);
}
