# Como conseguir uma key do OpenRouter

O BakaSub traduz pelo [OpenRouter](https://openrouter.ai/), um serviço que dá acesso a vários modelos de IA (Gemini, GPT, Claude, DeepSeek e outros) com uma única conta. Você paga ao OpenRouter pelo que usar, e o BakaSub mostra o custo estimado antes de cada tradução.

## Passos

1. **Crie uma conta** em [openrouter.ai](https://openrouter.ai/) (e-mail, Google ou GitHub).
2. **Adicione créditos** em [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits). Com os modelos mais baratos, poucos dólares traduzem muitas legendas; a estimativa do BakaSub mostra quanto custa cada arquivo.
3. **Crie uma key** em [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) com **Create Key**. Você pode dar um nome (`BakaSub`) e, se quiser mais segurança, um limite de créditos.
4. **Copie a key na hora** (ela começa com `sk-or-`). O OpenRouter mostra a key uma única vez; se perder, apague e crie outra.
5. No BakaSub, cole a key no primeiro passo do onboarding ou, depois, em **Configurações → Key do OpenRouter**.

O OpenRouter pode mudar nomes de botões e páginas com o tempo; créditos e keys ficam sempre nas configurações da sua conta.

## Escolhendo modelos

Depois da key, o BakaSub pede que você marque pelo menos um modelo como favorito em **Modelos** e escolha um padrão. Modelos marcados como **Moderado** podem recusar algumas falas (elas ficam no idioma original); **Custo exato** quer dizer que a estimativa usa o tokenizer do próprio modelo.

Modelos gratuitos (terminados em `:free`) não custam nada, mas têm limites por minuto e por dia: veja [Limites, esperas e novas tentativas](./openrouter-limits.md).

## Privacidade

- A key fica guardada criptografada no seu computador (no chaveiro do sistema, quando existe) e nunca é mostrada de novo, nem pelas telas do próprio BakaSub.
- O texto das legendas que você traduz é enviado ao OpenRouter e ao provedor do modelo escolhido. Confira as políticas deles se as suas legendas forem privadas.
