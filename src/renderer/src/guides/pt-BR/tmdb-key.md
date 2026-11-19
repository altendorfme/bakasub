# Como conseguir uma key do TMDB

O BakaSub usa o [The Movie Database (TMDB)](https://www.themoviedb.org/) para reconhecer o que você está traduzindo e passar à IA o título, os gêneros e a sinopse (e a sinopse do episódio, no caso de séries). É **opcional**: sem a key, a tradução funciona do mesmo jeito, só que sem esse contexto.

A key é gratuita para uso pessoal e não comercial, e leva poucos minutos.

## Passos

1. **Crie uma conta** em [themoviedb.org/signup](https://www.themoviedb.org/signup) e confirme o e-mail.
2. Abra **Settings → API** em [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
3. Peça uma API key e escolha a opção **Developer** (pessoal). Aceite os termos de uso.
4. Preencha o formulário curto da aplicação. Algo assim basta:
   - Application name: `BakaSub`
   - Application URL: `https://github.com/lsilvatti/bakasub`
   - Summary: `Personal desktop app that translates subtitles; uses TMDB for titles and synopses.`
5. Na mesma página de API, copie o **API Read Access Token** (um texto longo que começa com `eyJ`). A **API Key** mais curta (32 letras e números) também funciona.
6. No BakaSub, cole em **Configurações → Key do TMDB**. O BakaSub confere a key com o TMDB antes de salvar.

O TMDB pode mudar nomes de botões e páginas com o tempo; a página de API fica sempre nas configurações da sua conta.

## Privacidade

- A key fica guardada criptografada no seu computador (no chaveiro do sistema, quando existe) e só sai dele nas requisições ao TMDB.
- Só o **título e o ano** tirados do nome do arquivo são enviados ao TMDB na busca. Suas legendas nunca vão para o TMDB.
- As imagens são baixadas pelo BakaSub e ficam num cache local (no máximo 200 MB).

Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
