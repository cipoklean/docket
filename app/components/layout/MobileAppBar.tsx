import { AgentNativeIcon } from "@agent-native/toolkit/app/shared/AgentNativeIcon";
import { useT } from "@agent-native/core/client/i18n";
import { IconMessages } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";

interface MobileAppBarProps {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  onOpenChats: () => void;
}

/** The one 48px bar above every route: Docket home, page title, actions, past chats. */
export function MobileAppBar({
  title,
  actions,
  className,
  onOpenChats,
}: MobileAppBarProps) {
  const t = useT();
  return (
    <header
      data-mobile-app-bar=""
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3",
        className,
      )}
    >
      <Link
        to="/court"
        aria-label={APP_TITLE}
        className="flex shrink-0 items-center gap-2 rounded text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AgentNativeIcon aria-hidden="true" className="h-3.5 w-6" />
        {title ? null : <span>{APP_TITLE}</span>}
      </Link>
      <div className="flex min-w-0 flex-1 items-center truncate text-sm font-medium">
        {title}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <button
          type="button"
          onClick={onOpenChats}
          aria-label={t("navigation.openNavigation")}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <IconMessages className="size-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
