# FinanceEcom Monitor — Extensão Chrome

Coleta e monitora anúncios de concorrentes do Mercado Livre direto no painel FinanceEcom.

## Como instalar (modo desenvolvedor, para testar)

1. Abra o Chrome em `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação** (Load unpacked)
4. Selecione a pasta `extension/` deste projeto
5. A extensão aparece na barra. Clique no ícone → cole o **token da extensão**
   (pegue em: sistema → **Análise de Produtos** → *Configurações de IA e Extensão*)
6. Clique **Testar** para confirmar a conexão.

## Como usar

1. No sistema, crie um produto e clique **▶ Coleta ativa** (marca o alvo).
2. Navegue no Mercado Livre até o anúncio de um concorrente.
3. No painel azul (canto inferior direito) clique **💾 Salvar na análise**.
4. O concorrente vira um card no produto, com preço, nota, foto, ficha técnica, etc.
5. A partir daí a extensão **recoleta sozinha 1×/dia** cada concorrente salvo
   (aba oculta), atualizando preço e gravando o histórico. Deixe o Chrome aberto.

## Arquivos

- `manifest.json` — configuração MV3
- `content.js` — lê o DOM do anúncio (extrator) + painel "Salvar na análise"
- `service-worker.js` — cérebro: fila de recoleta, abas ocultas, alarme 15 min
- `popup.html` / `popup.js` — configuração (URL, token) e status
- `icons/` — ícones

## Publicar na Chrome Web Store (Fase 5)

Requer conta de desenvolvedor (US$ 5 única), política de privacidade, ícones,
screenshots e revisão do Google. A build é única e global; cada cliente usa o
próprio token — nada muda no código por cliente.

## Limitações (inerentes)

- Só coleta com o **Chrome aberto e logado**. É extensão, não robô no servidor.
- "Vendidos" do concorrente é aproximado (o ML mostra faixa "+50 vendidos").
- Vai devagar de propósito (máx. 3 abas) para não parecer robô ao ML.
