import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import { Text } from "@tiendanube/nube-sdk-jsx";

export function App(nube: NubeSDK) {
	nube.render("app_settings", <Text>Omafit Admin OK</Text>);
}
