import { COLUMNS, type Board, type Card } from "@shared/types"

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" })

function formatDuration(ms: number) {
  const minutes = Math.max(Math.round(ms / 60000), 1)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`
}

/** Keeps user text from breaking the Markdown structure (lists, headings, tables). */
function inline(text: string) {
  return text.replace(/\s*\n\s*/g, " ").replace(/([\\`*_|[\]#<>])/g, "\\$1")
}

function renderCard(card: Card) {
  if (card.items.length === 1) {
    const [item] = card.items
    return `- ${inline(item.text)} — _${inline(item.authorName)}_`
  }
  const lines = card.items.map((item) => `  - ${inline(item.text)} — _${inline(item.authorName)}_`)
  return [`- **Grupo com ${card.items.length} itens**`, ...lines].join("\n")
}

export function buildReport(board: Board) {
  const end = board.finishedAt ?? Date.now()
  const participants = Object.values(board.participants).sort((a, b) => a.joinedAt - b.joinedAt)
  const host = board.participants[board.hostId]
  const out: string[] = []

  out.push(`# ${inline(board.title)}`, "")
  out.push(`> Relatório gerado pelo Backbeat em ${dateTime.format(new Date())}`, "")
  out.push("## Visão geral", "")
  out.push(`- **Início:** ${dateTime.format(new Date(board.createdAt))}`)
  out.push(`- **Encerramento:** ${board.finishedAt ? dateTime.format(new Date(board.finishedAt)) : "em andamento"}`)
  out.push(`- **Duração:** ${formatDuration(end - board.createdAt)}`)
  out.push(`- **Host:** ${inline(host?.name ?? "—")}`)
  out.push(`- **Participantes (${participants.length}):** ${participants.map((p) => inline(p.name)).join(", ")}`)
  out.push("")

  out.push("## Resumo", "", "| Coluna | Cards | Itens |", "| --- | ---: | ---: |")
  for (const col of COLUMNS) {
    const cards = board.cards.filter((c) => c.column === col.id)
    const items = cards.reduce((n, c) => n + c.items.length, 0)
    out.push(`| ${col.emoji} ${col.title} | ${cards.length} | ${items} |`)
  }
  out.push("")

  for (const col of COLUMNS) {
    // Bigger groups first: they are the topics the team agreed on the most.
    const cards = board.cards
      .filter((c) => c.column === col.id)
      .sort((a, b) => b.items.length - a.items.length || a.createdAt - b.createdAt)
    out.push(`## ${col.emoji} ${col.title}`, "")
    out.push(cards.length ? cards.map(renderCard).join("\n") : "_Nenhum card nesta coluna._", "")
  }

  const contributions = new Map<string, number>()
  for (const item of board.cards.flatMap((c) => c.items)) {
    contributions.set(item.authorName, (contributions.get(item.authorName) ?? 0) + 1)
  }
  if (contributions.size) {
    out.push("## Contribuições", "", "| Participante | Itens |", "| --- | ---: |")
    for (const [name, count] of [...contributions].sort((a, b) => b[1] - a[1])) {
      out.push(`| ${inline(name)} | ${count} |`)
    }
    out.push("")
  }

  if (board.playlist.length) {
    out.push("## 🎵 Trilha sonora", "")
    board.playlist.forEach((t, i) => {
      out.push(`${i + 1}. [${inline(t.title)}](https://www.youtube.com/watch?v=${t.videoId}) — sugerida por _${inline(t.addedBy)}_`)
    })
    out.push("")
  }

  out.push("## Ações combinadas", "", "- [ ] ", "")
  return out.join("\n")
}

export function downloadReport(board: Board) {
  const slug = board.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const blob = new Blob([buildReport(board)], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${slug || "retro"}-${new Date(board.finishedAt ?? Date.now()).toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}
