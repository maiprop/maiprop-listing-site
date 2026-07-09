/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom";

const LISTING_LINK_REGEX = /(\/?(property|new-build|auction|open-house)\/([a-f0-9-]{36}))/gi;

type ListingRoute = "property" | "new-build" | "auction" | "open-house";

type Part =
  | { type: "text"; value: string }
  | { type: "link"; route: ListingRoute; id: string; match: string };

export function parseMessageContent(content: string): Part[] {
  if (!content || typeof content !== "string") return [];
  const parts: Part[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(LISTING_LINK_REGEX.source, "gi");
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, m.index) });
    }
    const route = m[2] as ListingRoute;
    const id = m[3] ?? "";
    parts.push({ type: "link", route, id, match: m[0] });
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
            to={`/${p.route}/${p.id}`}
            className="text-primary underline hover:text-primary/80"
          >
            {p.match}
          </Link>
        )
      )}
    </span>
  );
}
