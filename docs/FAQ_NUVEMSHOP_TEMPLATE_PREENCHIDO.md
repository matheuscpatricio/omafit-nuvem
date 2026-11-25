# Omafit — Perguntas Frequentes (FAQs)

Última atualização: 25/11/2026

Modelo oficial: [Template FAQ Marketing e demais categorias](https://docs.google.com/document/d/1RMy2SpqRm2k1QVPBjngeMePFWf3RdObvdcg7wACIrjQ/edit) e [Guia Tutorial de Instalação Nuvemshop](https://docs.google.com/document/d/1eIhxJ6QbQCh3kwmUtSOV_yAPkhEkRYchMQfMR9eM2eg/edit), citados em https://dev.nuvemshop.com.br/docs/publication/requirements.

App Nuvemshop **23607**. Campos que o código e a documentação deste repositório não confirmam estão como `[PREENCHER]`.

## 1. Gerais

### 1.1. Qual a categoria do aplicativo? Para que serve o aplicativo?

- Categorias: Marketing e demais categorias (provador virtual e recomendação de tamanho para moda). A categoria exata marcada no Partner Portal é `[PREENCHER]`.
- O Omafit mostra um botão na página do produto (PDP). O cliente abre o widget, informa medidas ou envia uma foto, e o app sugere o tamanho com a tabela cadastrada pelo lojista. Há fluxo de vestuário (`widget.html`) e de calçado (`widget-footwear.html`).

### 1.2. Qual(is) o(s) principal(is) problema(s) do lojista que o aplicativo resolve e como?

- Devolução por tamanho errado. O widget recomenda um tamanho a partir da tabela de medidas da loja e, quando o cliente segue o fluxo de foto, da pose detectada no navegador.
- Dúvida na página do produto. O botão fica acima ou abaixo de Comprar, conforme a configuração do admin.

### 1.3. Qual o perfil de lojista recomendado para esse aplicativo? Existem requisitos específicos de perfil de negócio?

- Loja de moda com produto de vestuário ou calçado, fotos e variantes de tamanho.
- O lojista precisa cadastrar ao menos uma tabela de medidas no admin Omafit e vincular o handle da coleção.
- Não há, no código, restrição de faturamento, cidade ou quantidade mínima de pedidos. `[PREENCHER]` se a operação comercial tiver um perfil mínimo além disso.

### 1.4. Onde funciona o aplicativo? (cidades, estados, regiões, países)

- Loja Nuvemshop. A homologação deste repositório usa a loja demo `6994912` (`arrascaneta.lojavirtualnuvem.com.br`), tema Morelia.
- O NubeSDK desenha o botão em qualquer tema que envie o nome (Morelia incluído).
- Países publicados na App Store: `[PREENCHER]`. O admin e o widget têm textos em português, espanhol e inglês. Moeda e idioma vêm da loja.

### 1.5. Quem desenvolveu o aplicativo? Quais são os principais canais de suporte, quais dias/horários de atendimento e SLA?

- Quem desenvolveu o aplicativo: Omafit (`https://omafit.co`). O e-mail padrão do código é `contato@omafit.co` (`OMAFIT_SUPPORT_EMAIL`).

- POC Level 1:
  - Canal: `contato@omafit.co`
  - Dias e horários de atendimento: `[PREENCHER]`
  - SLA: `[PREENCHER]`

- POC Level 2:
  - Contato: `[PREENCHER]`
  - Dias e horários de atendimento: `[PREENCHER]`
  - SLA: `[PREENCHER]`

- POC Comercial:
  - Contato: `[PREENCHER]`
  - Dias e horários de atendimento: `[PREENCHER]`
  - SLA: `[PREENCHER]`

- POC Comercial Exclusivo Nuvemshop Next:
  - SLA: `[PREENCHER]`
  - Há possibilidade de negociar taxas? `[PREENCHER]`

- POC Técnico:
  - Contato: `contato@omafit.co`
  - Dias e horários de atendimento: `[PREENCHER]`
  - SLA: `[PREENCHER]`

### 1.6. Temos uma conta teste disponível?

- Loja demo usada na homologação: `https://arrascaneta.lojavirtualnuvem.com.br` (store id `6994912`).
- Login e senha do admin Nuvemshop: `[PREENCHER]`.
- O app abre dentro do admin da Nuvemshop. Não há usuário e senha próprios do Omafit para o lojista.

## 2. Planos e Preços

### 2.1. Qual a tabela de preços/precificação do aplicativo? Quais os tipos de planos disponíveis? Quais tarifas são cobradas?

Não há landing de preços neste repositório. Os planos estão em `getPlanCatalog()` (`server.js`). A mensalidade em BRL é o valor em USD vezes `USD_TO_BRL_RATE` (fallback do código: 5,7). O valor cobrado na loja pode mudar se a variável ou a cotação forem outras. Não há taxa de instalação no código.

| Plano | Mensalidade (USD no código) | Sessões de try-on incluídas | Excedente (USD por sessão, no código) |
|-------|-----------------------------|-----------------------------|----------------------------------------|
| On demand | 0 | 50 na criação da conta; depois cobrança por uso | 0,18 |
| Growth | 89 | 700 por mês. Inclui consultor stylist e layout hero | 0,12 |
| Pro | 300 | 3.000 por mês | 0,08 |
| Enterprise | 600 (anual no código: 6.000 USD, desconto anual citado de 1.200 USD) | código marca 2.000.000 e `unlimitedTryOn: true` | 0 |

Cobrança do lojista: modo `self` (Stripe no admin do app, aba Plano). O portal está documentado como Grátis + vendas no aplicativo. Cancelar: desinstalar o app na Nuvemshop ou cancelar a assinatura no Stripe.

Link público de preços: `[PREENCHER]`.

### 2.2. O aplicativo possui desconto para lojista Nuvemshop? Se sim, qual a porcentagem?

- Não há desconto percentual exclusivo de lojista Nuvemshop no código. `[PREENCHER]` se existir acordo comercial fora do repositório.

### 2.3. O aplicativo possui dias de trial? Se sim, quantos?

- Não há trial por dias no código. O plano On demand inclui 50 sessões sem mensalidade.

### 2.4. O aplicativo possui taxa de setup? Se sim, qual o valor?

- Não há taxa de setup no código.

### 2.5. O aplicativo possui precificação diferenciada para o lojista Nuvemshop Next?

- Não há preço diferente para Nuvemshop Next no código. `[PREENCHER]`

## 3. Instalação

### 3.1. URL da área de Login

- O lojista entra pelo admin Nuvemshop e abre o app Omafit (iframe).
- URL do app: `https://omafit-nuvem-production.up.railway.app/app.html`
- Redirect OAuth: `https://omafit-nuvem-production.up.railway.app/auth/callback`
- Não há tela de login Omafit separada para o lojista.

### 3.2. Possui requisitos prévios para fazer a instalação? Se sim, quais são?

- Conta de lojista Nuvemshop com permissão para instalar aplicativos.
- Permissões que a documentação de homologação lista: `read_products`, `read_content`, `read_orders`, `write_scripts`.
- Depois de mudar permissão: desinstalar e reinstalar o app e clicar em **Sincronizar loja** no admin Omafit.
- Para o botão aparecer na vitrine, o Partner Portal precisa de um único script NubeSDK em `https://omafit-nuvem-production.up.railway.app/main.min.js` e da flag **Uses NubeSDK**.

### 3.3. Como é o processo de instalação e liberação do aplicativo?

1. Instalar o app na Loja de Aplicativos Nuvemshop e aceitar as permissões OAuth.
2. A Nuvemshop redireciona para `/auth/callback`. O backend troca o código, grava a loja e registra webhooks.
3. Abrir o admin Omafit e clicar em **Sincronizar loja**.
4. Em **Widget**, ativar o botão, escolher texto, posição e categorias excluídas. Salvar.
5. Em **Tabelas**, criar a tabela de medidas da coleção.
6. Abrir a PDP de um produto que não esteja na categoria excluída e usar o botão.

Erros comuns no código e na doc:

- Widget em categoria excluída: conferir se só `main.min.js` está ativo no portal (scripts antigos ignoram a exclusão).
- Duas unidades no carrinho: o mesmo caso, dois scripts tratando o mesmo clique.
- App sem dados da loja: **Sincronizar loja** de novo depois de reinstalar.

### 3.4. O aplicativo possui seus próprios tutoriais? Se sim, colocar o(s) link(s) aqui.

- Checklist interno: `docs/HOMOLOGACAO_NUVEMSHOP.md` e `docs/NUVEMSHOP_SETUP.md`.
- Tutorial público para o lojista: `[PREENCHER]`
- Política de privacidade publicada: `https://omafit.co/privacidade` (a doc pede essa URL; o texto legal completo não está neste repositório).

### 3.5. Tutorial de Instalação Nuvemshop

Texto no estilo do Guia Tutorial de Instalação (infinitivo, fala com o lojista, sem primeira pessoa). Prints: `[PREENCHER]`.

#### 3.5.1. Como instalar o aplicativo?

Passo a passo de como instalar o aplicativo Omafit de recomendação de tamanho e provador virtual na loja.

O Omafit coloca um botão na página do produto para o cliente descobrir o tamanho antes de comprar. A configuração fica no painel de administração, sem editar o tema.

#### 3.5.2. Passo a passo detalhado para a instalação do aplicativo na Nuvemshop

1. Acessar a página do Omafit na Loja de Aplicativos Nuvemshop e clicar em **"Instalar aplicativo"**.
   `[PREENCHER: print da página do app]`

2. Ler as permissões pedidas (produtos, conteúdo, pedidos e scripts). Estando de acordo, clicar em **"Aceitar e começar a usar"**.
   `[PREENCHER: print das permissões]`

3. No painel de administração, abrir **Aplicativos** e entrar no Omafit.
   O app abre o painel embutido (`app.html`).

4. Na seção **Dashboard**, clicar em **"Sincronizar loja"**.
   Esse passo grava a loja e os webhooks usados pelo app.

5. Abrir a seção **Widget**. Ativar o botão, escrever o texto do botão (a doc de homologação usa “Assistente inteligente”), escolher se ele fica acima ou abaixo de Comprar e marcar as categorias que não devem exibir o widget. Clicar em **"Salvar"**.
   `[PREENCHER: print da aba Widget com Acessórios excluída]`

6. Abrir a seção **Tabelas** e criar a tabela de medidas da coleção, com o mesmo handle da coleção na Nuvemshop (exemplo: `tenis`).
   `[PREENCHER: print da tabela]`

7. Abrir a página de um produto que não esteja na categoria excluída. O botão do Omafit aparece uma vez, perto de Comprar. Clicar no botão, seguir o tamanho sugerido e adicionar ao carrinho. A quantidade adicionada é 1.

Observação: produto de categoria excluída, inclusive subcategoria, não deve mostrar o botão.

#### 3.5.3. Direcionamento para o suporte do aplicativo

Tem alguma dúvida sobre o funcionamento da ferramenta ou está com algum problema relacionado ao serviço do Omafit? Sugerimos enviar um e-mail para contato@omafit.co. A equipe da plataforma vai te dar todo o apoio que você precisa com o aplicativo.

Horário e prazo de resposta: `[PREENCHER]`

#### 3.5.4. Considerações gerais

- O tema da loja demo de homologação é Morelia. Não é preciso trocar para Patagonia.
- Um único script de vitrine deve ficar ativo, apontando para `main.min.js`.
- Prints deste tutorial: `[PREENCHER]`

## 4. Funcionamento

### 4.1. Configuração e funcionalidades

**Admin (iframe no painel Nuvemshop)**

- Dashboard com sincronização da loja e status de webhooks.
- Widget: texto, cor, logo, posição do botão, tipo link ou botão, categorias excluídas, layout do provador (default, sidebar; hero no plano Growth ou superior).
- Tabelas de medidas por coleção, com tipo vestuário ou calçado.
- Plano e uso de sessões de try-on (Stripe no modo de cobrança própria).
- Try On Marketing (WhatsApp) existe no código para lojas autorizadas. Não faz parte do fluxo mínimo da homologação do widget.

**Vitrine**

- O `main.min.js` pede `GET /api/storefront/widget-config` e esconde o botão quando a categoria do produto (id, handle ou nome, com ou sem acento) está na lista excluída. A lista inclui as subcategorias da categoria marcada.
- No tema Morelia a categoria da PDP aparece no breadcrumb (`/acessorios/`, `/sueteres/`). `LS.product` dessa loja não traz o array `categories`.
- O modal abre `widget.html` ou `widget-footwear.html`.
- **Adicionar ao carrinho** manda uma unidade (`quantity: 1`) via `cart:add` do NubeSDK. Um segundo script legado não deve clicar de novo em Comprar.

**Privacidade (o que o código faz)**

- A detecção de pose usa MediaPipe (`PoseLandmarker`) no navegador do cliente, em worker ou na thread principal. O modelo é carregado do armazenamento do MediaPipe; o WASM, de CDN. Os pontos da pose são calculados no aparelho.
- Medidas usadas na recomendação (peito, cintura, quadril, altura, peso, gênero, preferência de caimento) podem ser enviadas ao backend (`/api/widget/tryon` e a função `track-footwear-tryon`) para calcular o tamanho e contar a sessão.
- A foto do cliente, quando o fluxo gera o try-on, é enviada para `/api/widget/tryon`, que encaminha à função Supabase `tryon`. A foto não fica só no aparelho nesse fluxo.
- Se o cliente consente, o perfil (medidas e e-mail opcional) é gravado pela função `shopper-profile`, ligado a um id de dispositivo da loja. Dá para apagar esse perfil pela mesma função.
- Dados da loja no app: store id, domínio, produtos, configuração do widget, métricas de uso e cobrança. Webhooks `store/redact` e `customers/redact` estão implementados.
- Compartilhamento citado na doc interna: Supabase (infra), Stripe (pagamento), Meta (WhatsApp Marketing, se a loja usar).
- Política publicada: `https://omafit.co/privacidade`. Retenção e base legal detalhadas: `[PREENCHER]` no texto jurídico, se ainda não estiverem nessa URL.
