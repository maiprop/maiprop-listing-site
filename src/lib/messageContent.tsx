import { Link } from "react-router-dom";

const PROPERTY_LINK_REGEX = /(\/property\/([a-f0-9-]{36})|property\/([a-f0-9-]{36}))/gi;

type Part = { type: "text"; value: string } | { type: "link"; id: string; match: string };

export function parseMessageContent(content: string): Part[] {
  if (!content || typeof content !== "string") return [];
  const parts: Part[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(PROPERTY_LINK_REGEX.source, "gi");
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, m.index) });
    }
    const id = (m[2] || m[3]) ?? "";
    parts.push({ type: "link", id, match: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: content }];
}

export function MessageContent({ content, className }: { content: string; className?: string }) {
  const parts = parseMessageContent(content);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <Link
            key={i}
            to={`/property/${p.id}`}
            className="text-primary underline hover:text-primary/80"
          >
            {p.match}
          </Link>
        )
      )}
    </span>
  );
}
