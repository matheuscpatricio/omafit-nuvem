import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import { Column, Button, Text, Iframe } from "@tiendanube/nube-sdk-jsx";

export function App(nube: NubeSDK) {
  // 1️⃣ Renderiza o botão abaixo do botão de carrinho
  nube.render(
    "after_product_detail_add_to_cart",
    <Button
      variant="link"
      onClick={() => {
        // 2️⃣ Abre o modal com o iframe
        nube.render(
          "modal_content",
          <Column padding="16px" gap="16px">
            <Iframe
              src="https://omafit.netlify.app"
              height="600px"
            />

            <Button
              variant="secondary"
              onClick={() => {
                // 3️⃣ Fecha o modal
                nube.clearSlot("modal_content");
              }}
            >
              Fechar
            </Button>
          </Column>
        );
      }}
    >
      Ver meu tamanho ideal (Omafit)
    </Button>
  );
}
