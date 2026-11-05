import { Outlet } from "react-router";

import { ModelGate } from "@/lib/court";

export default function CourtLayout() {
  return (
    <>
      <ModelGate />
      <Outlet />
    </>
  );
}
