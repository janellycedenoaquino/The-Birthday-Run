// GitHub issues for the F-13 Actions (BUILD F-13, §0.8 swappable layer): `gh` in the Action, an
// in-memory sink in tests. Only these four calls exist, so the scripts can't do anything else
// with the token (no closing, labelling other issues, or touching code).
import { execFileSync } from "node:child_process";

export type OpenIssue = { number: number; title: string };

export interface IssueSink {
  /** The open issue with this label whose title is exactly `title`, or null. */
  findOpen(label: string, title: string): Promise<OpenIssue | null>;
  create(label: string, title: string, body: string): Promise<number>;
  comment(issue: number, body: string): Promise<void>;
  editBody(issue: number, body: string): Promise<void>;
}

const gh = (args: string[]) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

/** The real sink: the `gh` CLI with the workflow's own GITHUB_TOKEN (GH_TOKEN). */
export const ghIssues: IssueSink = {
  async findOpen(label, title) {
    // The search may match loosely (BUILD F-13 "Unverified"), so the title is compared here.
    const list = JSON.parse(
      gh([
        "issue",
        "list",
        "--state",
        "open",
        "--label",
        label,
        "--limit",
        "500",
        "--json",
        "number,title",
      ]),
    ) as OpenIssue[];
    return list.find((i) => i.title === title) ?? null;
  },
  async create(label, title, body) {
    const url = gh([
      "issue",
      "create",
      "--label",
      label,
      "--title",
      title,
      "--body",
      body,
    ]);
    const n = Number(/\/issues\/(\d+)\s*$/.exec(url.trim())?.[1]);
    if (!Number.isInteger(n))
      throw new Error("gh issue create: no issue number in its output");
    return n;
  },
  async comment(issue, body) {
    gh(["issue", "comment", String(issue), "--body", body]);
  },
  async editBody(issue, body) {
    gh(["issue", "edit", String(issue), "--body", body]);
  },
};
