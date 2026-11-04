import { useT } from "@agent-native/core/client/i18n";
import {
  HeaderActionsProvider,
  useHeaderActions,
  useHeaderTitle,
} from "@agent-native/toolkit/app-shell/header-actions";
import {
  isAgentChatHomeHandoffActive,
  useAgentChatHomeHandoff,
  useAgentChatHomeHandoffLinks,
} from "@agent-native/toolkit/app/chat/agentkit-chat/rail";
import {
  RealtimeVoiceModeProvider,
  useRealtimeVoiceModeOptional,
} from "@agent-native/toolkit/app/chat/composer";
import { isSettingsPathname } from "@agent-native/toolkit/app/settings";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { APP_TITLE } from "@/lib/app-config";
import { isChatPathname } from "@/lib/chat-paths";
import { TAB_ID } from "@/lib/tab-id";

// Not lazy() like Header: the inspector wraps the page, so a Suspense fallback
// would mount the page once before its chunk loads and again after.
// AgentSidebar already lazy-loads its own panel.
import { AgentInspector } from "./AgentInspector";
import { MobileAppBar } from "./MobileAppBar";
import { Sidebar } from "./Sidebar";

const Header = lazy(() =>
  import("./Header").then((module) => ({ default: module.Header })),
);

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * A voice chat follows the user into a chat thread, so Get started can hand
 * one off. Other pages show no controls for this session, so any other
 * navigation ends it rather than leave the microphone open with nothing to
 * stop it. The agent sidebar owns a separate session and keeps its own
 * controls on screen, so this leaves that one alone.
 */
function EndVoiceChatOutsideChat() {
  const { pathname } = useLocation();
  const end = useRealtimeVoiceModeOptional()?.end;
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    if (!isChatPathname(pathname)) end?.();
  }, [end, pathname]);

  return null;
}

export function Layout({ children }: LayoutProps) {
  return (
    <RealtimeVoiceModeProvider browserTabId={TAB_ID}>
      <EndVoiceChatOutsideChat />
      <LayoutShell>{children}</LayoutShell>
    </RealtimeVoiceModeProvider>
  );
}

function LayoutShell({ children }: LayoutProps) {
  const t = useT();
  const location = useLocation();
  const [chatsOpen, setChatsOpen] = useState(false);
  const isChatRoute = isChatPathname(location.pathname);
  // Settings brings its own navigation, header, and agent toggle, so it
  // renders full width.
  const settingsOwnsChrome = isSettingsPathname(location.pathname);
  const chatHomeHandoffActive = useAgentChatHomeHandoff({
    storageKey: "chat",
    activePath: location.pathname,
    enabled: !isChatRoute,
  });
  const chatHomeHandoffPending = isAgentChatHomeHandoffActive("chat");
  useAgentChatHomeHandoffLinks({
    storageKey: "chat",
    isChatPath: isChatPathname,
    requireActiveHandoff: true,
  });

  useEffect(() => {
    setChatsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const close = () => setChatsOpen(false);
    window.addEventListener("agent-chat:open-thread", close);
    return () => window.removeEventListener("agent-chat:open-thread", close);
  }, []);

  const openChats = () => setChatsOpen(true);
  const pageTitle = useHeaderTitle();
  const pageActions = useHeaderActions();
  const contentFrame = (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {settingsOwnsChrome ? null : isChatRoute ? (
        <MobileAppBar
          title={pageTitle ?? APP_TITLE}
          actions={pageActions}
          onOpenChats={openChats}
        />
      ) : (
        <Suspense fallback={<div className="h-12 shrink-0" />}>
          <Header onOpenChats={openChats} />
        </Suspense>
      )}
      <main className="agent-native-app-main min-w-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
    </div>
  );

  return (
    <HeaderActionsProvider>
      <div className="agent-layout-shell chat-layout-shell flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sheet open={chatsOpen} onOpenChange={setChatsOpen}>
          <SheetContent side="left" className="w-[var(--chat-sidebar-width)] p-0">
            <SheetTitle className="sr-only">{t("navigation.navigation")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("navigation.navigationDescription")}
            </SheetDescription>
            <Sidebar collapsed={false} collapsible={false} />
          </SheetContent>
        </Sheet>
        {isChatRoute || settingsOwnsChrome ? (
          <div
            data-agent-chat-canvas="true"
            className="agent-layout-main-surface flex min-w-0 flex-1 overflow-hidden"
          >
            {contentFrame}
          </div>
        ) : (
          <AgentInspector
            chatHomeHandoffActive={chatHomeHandoffActive}
            chatHomeHandoffPending={chatHomeHandoffPending}
          >
            {contentFrame}
          </AgentInspector>
        )}
      </div>
    </HeaderActionsProvider>
  );
}
