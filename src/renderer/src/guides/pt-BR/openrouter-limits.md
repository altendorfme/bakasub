# Limites, esperas e novas tentativas

O OpenRouter limita a frequência de chamadas a alguns modelos. O BakaSub controla esses limites por você: espaça as requisições, espera quando o OpenRouter pede e tenta de novo quando uma requisição falha. Normalmente você não precisa mudar nada.

## Modelos gratuitos e pagos

**Modelos gratuitos** (os terminados em `:free`) têm limites para toda conta:

- **20 requisições por minuto**;
- **50 requisições por dia** se você comprou menos de US$ 10 em créditos do OpenRouter no total;
- **1000 requisições por dia** a partir de US$ 10 comprados (conta o que você já comprou em qualquer momento, não o saldo atual).

A contagem diária zera às **00:00 UTC** (21:00 no horário de Brasília). O BakaSub lê o seu patamar no OpenRouter, então você não precisa informar se adicionou créditos.

**Modelos pagos** não têm limite do próprio OpenRouter. A empresa que roda o modelo ainda pode estar ocupada e pedir ao BakaSub que diminua o ritmo por um instante.

Quantas requisições um arquivo usa? Mais ou menos uma a cada 40 falas que não estão no cache de tradução, mais algumas para corrigir falas que o modelo errou. Um episódio de 24 minutos costuma usar de 8 a 12 requisições. Antes de traduzir, o BakaSub mostra quantas requisições o job precisa e quantas ainda restam hoje, e pede confirmação quando não forem suficientes.

## O que pode aparecer na fila

- **Aguardando o limite de requisições**: o BakaSub está espaçando as requisições para não passar do limite por minuto. O job continua sozinho.
- **Pausado após limite de requisições**: o OpenRouter pediu ao BakaSub que diminuísse o ritmo. Todos os jobs que usam o mesmo tipo de modelo (gratuito ou pago) esperam juntos e depois continuam.
- **Tentando de novo**: uma requisição falhou (rede, provedor ocupado). O BakaSub espera um pouco mais a cada vez e tenta outra vez. Se uma parte do arquivo continuar falhando, ele espera um minuto, depois dois, e tenta essa parte de novo antes de desistir.

Falas já traduzidas nunca se perdem. Elas são salvas durante o job, então tentar de novo um job que falhou continua de onde parou e não paga por elas outra vez.

## Quando um job para

- **Limite diário de modelos gratuitos atingido**: espere até 00:00 UTC e tente o job de novo, use um modelo pago ou adicione créditos (a partir de US$ 10, os modelos gratuitos permitem 1000 requisições por dia).
- **O modelo está indisponível no momento**: o provedor continuou falhando depois de todas as tentativas. Tente mais tarde ou escolha outro modelo.
- **Seus créditos do OpenRouter acabaram**: adicione créditos e tente o job de novo.

## Configurações avançadas

Em **Configurações → Avançado** você pode mudar como o BakaSub espaça e repete as requisições. Os valores padrão seguem os limites do OpenRouter; mude só se tiver um motivo.

| Configuração                                        | Padrão     | Quando mudar                                                              |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Requisições por minuto (modelos gratuitos)          | 20         | diminua se usar a mesma conta do OpenRouter em outros apps ao mesmo tempo |
| Requisições por minuto (modelos pagos)              | sem limite | defina um valor se um provedor vive pedindo para diminuir o ritmo         |
| Patamar dos modelos gratuitos                       | automático | defina à mão só se a detecção automática estiver errada                   |
| Tentativas quando pedem para diminuir o ritmo       | 5          | aumente para modelos gratuitos muito concorridos                          |
| Tentativas após erros                               | 3          | aumente se a conexão for instável                                         |
| Primeira espera / maior espera entre tentativas     | 1 s / 30 s | aumente se a conexão for instável                                         |
| Rodadas extras para uma parte do arquivo que falhou | 2          | use 0 para falhar na hora em vez de esperar minutos                       |

**Restaurar padrões** volta todos os valores.
