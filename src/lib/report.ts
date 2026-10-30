import { COLUMNS, isPlaceholderTitle, type Board, type Card } from "@shared/types"
import type { Dict } from "@/i18n/pt"

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

function renderCard(card: Card, t: Dict) {
  if (card.items.length === 1) {
    const [item] = card.items
    return `- ${inline(item.text)} — _${inline(item.authorName)}_`
  }
  const lines = card.items.map((item) => `  - ${inline(item.text)} — _${inline(item.authorName)}_`)
  return [`- **${t.report.group(card.items.length)}**`, ...lines].join("\n")
}

/** Builds the Markdown report in the language of whoever generates it. */
export function buildReport(board: Board, t: Dict) {
  const dateTime = new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeStyle: "short" })
  const r = t.report
  const end = board.finishedAt ?? Date.now()
  const participants = Object.values(board.participants).sort((a, b) => a.joinedAt - b.joinedAt)
  const host = board.participants[board.hostId]
  const out: string[] = []

  out.push(`# ${inline(board.title)}`, "")
  out.push(`> ${r.generatedBy(dateTime.format(new Date()))}`, "")
  out.push(`## ${r.overview}`, "")
  out.push(`- **${r.start}:** ${dateTime.format(new Date(board.createdAt))}`)
  out.push(`- **${r.end}:** ${board.finishedAt ? dateTime.format(new Date(board.finishedAt)) : r.inProgress}`)
  out.push(`- **${r.duration}:** ${formatDuration(end - board.createdAt)}`)
  out.push(`- **${r.host}:** ${inline(host?.name ?? "—")}`)
  out.push(`- **${r.participants(participants.length)}:** ${participants.map((p) => inline(p.name)).join(", ")}`)
  out.push("")

  out.push(`## ${r.summary}`, "", `| ${r.column} | ${r.cards} | ${r.items} |`, "| --- | ---: | ---: |")
  for (const { id } of COLUMNS) {
    const cards = board.cards.filter((c) => c.column === id)
    const items = cards.reduce((n, c) => n + c.items.length, 0)
    out.push(`| ${t.columns[id]} | ${cards.length} | ${items} |`)
  }
  out.push("")

  for (const { id } of COLUMNS) {
    // Bigger groups first: they are the topics the team agreed on the most.
    const cards = board.cards
      .filter((c) => c.column === id)
      .sort((a, b) => b.items.length - a.items.length || a.createdAt - b.createdAt)
    out.push(`## ${t.columns[id]}`, "")
    out.push(cards.length ? cards.map((c) => renderCard(c, t)).join("\n") : `_${r.emptyColumn}_`, "")
  }

  const contributions = new Map<string, number>()
  for (const item of board.cards.flatMap((c) => c.items)) {
    contributions.set(item.authorName, (contributions.get(item.authorName) ?? 0) + 1)
  }
  if (contributions.size) {
    out.push(`## ${r.contributions}`, "", `| ${r.participant} | ${r.items} |`, "| --- | ---: |")
    for (const [name, count] of [...contributions].sort((a, b) => b[1] - a[1])) {
      out.push(`| ${inline(name)} | ${count} |`)
    }
    out.push("")
  }

  if (board.playlist.length) {
    out.push(`## ${r.soundtrack}`, "")
    board.playlist.forEach((track, i) => {
      const title = isPlaceholderTitle(track.title) ? t.player.untitled : track.title
      out.push(
        `${i + 1}. [${inline(title)}](https://www.youtube.com/watch?v=${track.videoId}) — ${r.suggestedBy(`_${inline(track.addedBy)}_`)}`,
      )
    })
    out.push("")
  }

  out.push(`## ${r.actionItems}`, "", "- [ ] ", "")
  return out.join("\n")
}

export function downloadReport(board: Board, t: Dict) {
  const slug = board.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const blob = new Blob([buildReport(board, t)], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${slug || t.report.fileName}-${new Date(board.finishedAt ?? Date.now()).toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}
