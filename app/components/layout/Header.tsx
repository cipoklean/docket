import { useT } from "@agent-native/core/client/i18n";
import {
  useHeaderActions,
  useHeaderTitle,
} from "@agent-native/toolkit/app-shell";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { IconSettings } from "@tabler/icons-react";
import { Link } from "react-router";

import { MobileAppBar } from "./MobileAppBar";

export function Header({ onOpenChats }: { onOpenChats: () => void }) {
  const t = useT();
  const title = useHeaderTitle();
  const actions = useHeaderActions();

  return (
    <MobileAppBar
      title={title}
      onOpenChats={onOpenChats}
      actions={
        <>
          {actions}
          <Link
            to="/settings"
            aria-label={t("navigation.settings")}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconSettings className="size-4" strokeWidth={1.8} />
          </Link>
          <AgentToggleButton />
        </>
      }
    />
  );
}
