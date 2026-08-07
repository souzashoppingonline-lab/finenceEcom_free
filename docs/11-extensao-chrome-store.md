# Fase 5 — Publicar a extensão na Chrome Web Store

Guia prático para colocar a extensão “FinanceEcom — Análise de Produtos” na loja.

## 0. Pré-requisitos
- Conta Google (a mesma que você quer usar como desenvolvedor).
- **Taxa única de US$ 5** (pagamento no cadastro de desenvolvedor).
- Política de privacidade pública: **https://app.financeecom.com.br/privacidade-extensao.html** (já pronta).
- O `.zip` da extensão (pasta `extension/` compactada — sem a pasta pai).

## 1. Criar a conta de desenvolvedor
1. Acesse **https://chrome.google.com/webstore/devconsole**
2. Aceite os termos e pague a taxa de **US$ 5** (uma vez, vale para várias extensões).

## 2. Enviar o pacote
1. No Developer Dashboard → **Add new item**.
2. Faça upload do **`financeecom-extensao.zip`** (compacte o CONTEÚDO da pasta `extension/`,
   de forma que o `manifest.json` fique na raiz do zip).

## 3. Ficha da loja (Store listing) — textos prontos

**Nome:** FinanceEcom — Análise de Produtos

**Descrição curta (até 132 caracteres):**
> Salve anúncios do Mercado Livre no seu painel FinanceEcom e acompanhe preço, ficha técnica, avaliações e concorrência.

**Descrição longa (sugestão):**
> A extensão FinanceEcom ajuda lojistas a organizar a própria pesquisa de mercado no
> Mercado Livre. Ao abrir um anúncio, clique em “Salvar na análise” para guardar no seu
> painel FinanceEcom os dados públicos daquele anúncio: preço, nota e quantidade de
> avaliações, ficha técnica, descrição, imagem, vendedor, localidade e selo Full.
>
> No painel você acompanha o histórico de preço em gráfico, compara concorrentes, filtra e
> ordena, e (opcionalmente, com a sua própria chave de IA) gera um diagnóstico do anúncio.
>
> A extensão só coleta quando você pede, e só em páginas de anúncios do Mercado Livre.
> Cada usuário acessa apenas os próprios dados. Requer uma conta no FinanceEcom.

**Categoria:** Produtividade (ou Compras)
**Idioma:** Português (Brasil)

**Propósito único (campo “Single purpose”):**
> Salvar anúncios do Mercado Livre, que o usuário escolhe, no painel FinanceEcom do próprio
> usuário, para acompanhar preço, ficha técnica e informações públicas desses anúncios.

(EN) Save Mercado Livre product listings that the user selects into the user's own FinanceEcom
dashboard, to track price, specifications and public listing information.

## 4. Justificativa de permissões (campo “Permission justification”)
A extensão pede o MÍNIMO. Textos prontos para cada campo:

- **storage** — Armazenar localmente, no navegador do usuário, o token de acesso ao painel
  FinanceEcom e as preferências da extensão (URL do sistema e se a atualização automática
  está ligada). Nenhum dado é compartilhado com terceiros.
- **alarms** — Agendar uma verificação periódica (aprox. 1×/dia) para atualizar o preço dos
  anúncios que o próprio usuário já salvou. Sem isso, o usuário teria que reabrir cada
  anúncio manualmente.
- **downloads** — Baixar, quando o usuário clica em "Baixar mídias", as imagens e vídeos
  públicos do anúncio que ele está vendo, salvando na pasta Downloads do próprio usuário.
- **Host permission `https://*.mercadolivre.com.br/*`** — Ler os dados públicos do anúncio
  que o usuário está vendo (título, preço, avaliações, ficha técnica) quando ele clica em
  “Salvar na análise”, e reabrir em segundo plano anúncios já salvos para atualizar o preço.
- **Host permission `https://app.financeecom.com.br/*`** — Enviar os dados salvos ao painel
  do próprio usuário (backend do FinanceEcom), autenticando com o token do usuário.

> **Permissões removidas de propósito** (não são necessárias e causariam rejeição):
> `scripting` (não é usada — o content script é declarado no manifest) e `tabs` (a extensão
> nunca lê `tab.url`/`tab.title`; só cria/fecha abas e troca mensagens, o que não exige a
> permissão). Se um revisor perguntar, esta é a justificativa da ausência delas.

## 4b. Uso de código remoto / tratamento de dados
- **Remote code:** Não. A extensão não carrega nem executa código remoto; todo o JavaScript
  está no pacote. Ela apenas faz chamadas de dados (fetch) ao backend do FinanceEcom.
- **Data usage (marcar no formulário):** coleta “Website content” (dados públicos de anúncios)
  e um identificador de autenticação (o token). NÃO vende dados, NÃO usa para fins não
  relacionados à função principal, NÃO usa para verificação de crédito/empréstimo.
- **Uso de dados**: marque que os dados **não** são vendidos a terceiros, **não** são usados
  para fins não relacionados à função principal e **não** são usados para avaliação de crédito.
- **Política de privacidade (URL):** https://app.financeecom.com.br/privacidade-extensao.html

> Enquadre sempre como “ferramenta para o lojista organizar a PRÓPRIA pesquisa de mercado”.
> Nunca use as palavras “monitorar/vigiar pessoas” — isso dispara a política de surveillance.

## 5. Recursos visuais necessários
- **Ícone 128×128** — já incluído (`icons/icon128.png`).
- **Screenshots 1280×800 (ou 640×400)** — pelo menos 1, ideal 3–5. Sugestões:
  1. Painel “Análise de Produtos” com um produto e cards de concorrentes.
  2. Modal do gráfico de histórico de preço.
  3. O painel “Salvar na análise” dentro de um anúncio do Mercado Livre.
- **Tile promocional 440×280** (opcional, recomendado).

## 6. Enviar para revisão
1. Preencha tudo, salve como rascunho, clique em **Submit for review**.
2. Prazo típico: de algumas horas a ~2 semanas na primeira submissão (permissões `tabs`/
   `scripting` + host do ML costumam ter revisão manual).
3. Se pedirem ajuste, corrija e reenvie — é iterativo e normal.

## 7. Distribuição
- **Público** (qualquer um instala) ou **Não listado** (só quem tem o link).
- Para começar só com seus clientes, **Não listado** é uma boa opção.

## 8. Enquanto não aprova
Os clientes podem usar em **modo desenvolvedor** (Load unpacked) com o `.zip` — a extensão
já funciona 100% assim. A loja é para facilitar a instalação em 1 clique.

## 9. Atualizações futuras
Para publicar uma nova versão: aumente o `version` no `manifest.json`, gere novo `.zip` e
faça upload no mesmo item. A build é única e global — o que muda por cliente é só o token.
