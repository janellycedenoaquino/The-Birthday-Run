import type { IssueSink } from "../../scripts/lib/issues.ts";

// The in-memory IssueSink for the F-13 script tests (BUILD §0.8 swappable layer): issues in
// memory, every call recorded.
type Issue = { number: number; label: string; title: string; body: string };

export function memoryIssues(initial: Issue[] = []) {
  const issues = initial.map((i) => ({ ...i, comments: [] as string[] }));
  const calls: string[] = [];
  const find = (n: number) => {
    const i = issues.find((x) => x.number === n);
    if (!i) throw new Error(`no issue #${n}`);
    return i;
  };
  const sink: IssueSink = {
    async findOpen(label, title) {
      calls.push("findOpen");
      const i = issues.find((x) => x.label === label && x.title === title);
      return i ? { number: i.number, title: i.title } : null;
    },
    async create(label, title, body) {
      calls.push("create");
      const number = 100 + issues.length;
      issues.push({ number, label, title, body, comments: [] });
      return number;
    },
    async comment(issue, body) {
      calls.push("comment");
      find(issue).comments.push(body);
    },
    async editBody(issue, body) {
      calls.push("editBody");
      find(issue).body = body;
    },
  };
  return { sink, issues, calls };
}
