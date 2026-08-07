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

## 4. Justificativa de permissões (campo “Privacy practices”)
Preencha o propósito de cada permissão (textos prontos):
- **storage** — Armazenar localmente o token do usuário e as preferências da extensão.
- **tabs** — Reabrir, em segundo plano, anúncios que o próprio usuário já salvou, para
  atualizar o preço.
- **scripting** — Ler os dados públicos da página do anúncio aberto pelo usuário.
- **alarms** — Agendar a atualização periódica (1×/dia) dos anúncios salvos.
- **host permissions (mercadolivre.com.br, app.financeecom.com.br)** — Ler anúncios do
  Mercado Livre e enviar os dados ao painel do usuário no FinanceEcom.
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
