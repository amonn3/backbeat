# Backbeat 🎧

Retrospectivas em tempo real com trilha sonora. Crie um board, compartilhe o link e o time escreve o que
**foi bom**, o que **precisa melhorar** e o que **foi péssimo**, com música do YouTube tocando e um cronômetro
sincronizado para todos.

## Rodando

```bash
npm install
npm run dev        # API em :3101 + front (Vite) em :5173
```

Abra http://localhost:5173. Para testar com outra pessoa, abra o link do board em outra janela anônima.

Produção (um processo serve API + front):

```bash
npm run build
npm start          # http://localhost:3101  (PORT=xxxx para trocar)
```

## Funcionalidades

- **Criação do board**: nome obrigatório (nomes vazios travam o fluxo), título opcional e permissão da
  playlist ("todos podem mexer" ou "só o host"). O host pode mudar a permissão depois.
- **Convite por link**: quem abre o link precisa informar um nome antes de entrar.
- **Mini player do YouTube**: fila compartilhada; quando uma música acaba, a próxima começa para todos.
- **Cronômetro**: o host escolhe o tempo (atalhos ou minutos livres) e inicia, pausa ou zera. Todo mundo vê a
  mesma contagem, e há um aviso sonoro quando o tempo acaba.
- **Cards**: título + autor no canto inferior esquerdo. O autor (ou o host) remove o card.
- **Agrupar**: arraste um card sobre outro **da mesma coluna** para aglutinar. Dá para desagrupar depois.
- **Limpar coluna**: só o host, com confirmação.
- **Encerrar retro**: o host encerra, os cards ficam bloqueados e o relatório `.md` fica disponível para
  todos (prévia + download). O host pode reabrir.

## Stack

- React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui (Base UI)
- Express + Socket.IO (estado em memória, persistido em `data/boards.json`)
- @dnd-kit para o drag-and-drop

```
server/   API REST (criação) + eventos Socket.IO (todo o resto)
shared/   tipos e regras compartilhadas entre front e servidor
src/      front-end (pages/, components/, hooks/useBoard.ts, lib/report.ts)
```

> As identidades são leves (um id por navegador no localStorage, sem login). Ótimo para o time interno,
> mas não é autenticação de verdade.
