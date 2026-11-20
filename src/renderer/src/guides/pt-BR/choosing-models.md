# Como escolher um modelo

O BakaSub traduz pelo OpenRouter, que oferece centenas de modelos de vários provedores. O modelo define a qualidade, a velocidade e o preço de uma tradução. Você pode marcar vários com estrela em **Modelos** e escolher um a cada tradução.

## O que a lista mostra

| Item                    | O que significa                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Preço por 1M tokens** | O que o OpenRouter cobra por 1 milhão de tokens enviados ("entrada") e recebidos ("saída"). Um token é cerca de ¾ de uma palavra em inglês.                            |
| **Grátis**              | Não custa nada, mas tem limites por minuto e por dia. Veja [Limites, esperas e novas tentativas](./openrouter-limits.md).                                              |
| **Preço variável**      | Um roteador que escolhe um modelo por você; o BakaSub não consegue estimar o custo antes.                                                                              |
| **Contexto**            | Quanto texto o modelo lê de uma vez. As legendas são enviadas em partes pequenas, então qualquer modelo acima de 16k basta.                                            |
| **JSON confiável**      | O modelo pode ser obrigado a responder exatamente no formato que o BakaSub espera. Esses modelos precisam de menos novas tentativas, o que economiza tempo e dinheiro. |
| **Moderado**            | O provedor filtra conteúdo. Falas com violência, sexo ou palavrões podem ser recusadas e ficar no idioma original.                                                     |

## Quanto custa uma tradução

Um episódio de 24 minutos tem cerca de 300 a 400 falas, algo como 15 a 25 mil tokens em cada direção já contando o contexto. Com um modelo a US$ 0,30 de entrada e US$ 2,50 de saída por 1M tokens, isso dá perto de US$ 0,05 por episódio. O BakaSub sempre mostra a estimativa antes de traduzir, e falas já traduzidas vêm de graça do cache de tradução.

## Como escolher

- **Comece com um modelo rápido e barato** que tenha **JSON confiável**. Para a maioria das séries e filmes o resultado já é bom.
- **Traduza um episódio e leia.** Se nomes, tom ou piadas saírem errados, tente um modelo maior do mesmo provedor antes de trocar de provedor.
- **Evite modelos moderados para conteúdo adulto ou violento.** As falas bloqueadas aparecem no resultado, então você vê o que ficou de fora.
- **Modelos gratuitos servem para experimentar o BakaSub**, mas são mais lentos, podem estar ocupados, e o limite diário interrompe arquivos longos ou lotes.
- **Use também o preset e as notas.** Um glossário de nomes e uma nota curta sobre os personagens costumam melhorar mais o resultado do que um modelo mais caro.

## Filtros e ordenação

Em **Modelos** você pode ordenar por preço ou contexto, mostrar um provedor e manter só modelos gratuitos, com JSON confiável ou sem moderação. Os modelos com estrela ficam sempre no topo.
