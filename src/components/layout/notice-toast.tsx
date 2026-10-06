"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { msg, type MessageId } from "@/lib/messages";

// C-3 arrival notices (SPEC §3.2, BUILD §0.2, D24.31): `?notice=` from the §0.2 enum becomes one
// toast, then leaves the URL so a refresh or a shared link doesn't repeat it. Unknown values are
// ignored; only these fixed texts can ever be shown.
const NOTICES: Record<string, MessageId> = {
  account_deleted: "M-26",
  password_set: "M-27",
  password_changed: "M-28",
};

export function NoticeToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const notice = params.get("notice");

  useEffect(() => {
    if (!notice) return;
    const id = NOTICES[notice];
    if (id) toast.success(msg(id));
    const rest = new URLSearchParams(params);
    rest.delete("notice");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [notice, params, pathname, router]);

  return null;
}
