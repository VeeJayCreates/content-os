import * as React from "react";
import type { VisualAssetAcquisitionRun } from "@content-os/contracts";
import { acquisitionPresentation } from "./visual-asset-acquisition-state.ts";

export function VisualAssetAcquisitionView({
  acquisition,
  loading = false,
  statusAvailable = true,
  pending = false,
  action = null,
  canPrepare,
  canExecute,
  onPrepare,
  onExecute,
  ButtonComponent = "button",
}: {
  acquisition: VisualAssetAcquisitionRun | null;
  loading?: boolean;
  statusAvailable?: boolean;
  pending?: boolean;
  action?: string | null;
  canPrepare: boolean;
  canExecute: boolean;
  onPrepare: () => void;
  onExecute: () => void;
  ButtonComponent?: React.ElementType;
}) {
  const view = acquisition ? acquisitionPresentation(acquisition) : null;
  const disabled = pending || action !== null || loading;
  return React.createElement(
    "div",
    { "aria-label": "Visual asset acquisition" },
    React.createElement(
      "p",
      null,
      `Acquisition · ${loading ? "Loading" : !statusAvailable ? "Status unavailable" : (view?.status ?? "Not prepared")}`,
    ),
    canPrepare
      ? React.createElement(
          ButtonComponent,
          {
            disabled,
            onClick: onPrepare,
            ...(ButtonComponent === "button"
              ? {}
              : { size: "sm", variant: "outline" }),
          },
          action === "prepare-acquisition" ? "Preparing…" : "Prepare acquisition",
        )
      : null,
    canExecute
      ? React.createElement(
          ButtonComponent,
          {
            disabled,
            onClick: onExecute,
            ...(ButtonComponent === "button"
              ? {}
              : { size: "sm", variant: "outline" }),
          },
          action === "execute-acquisition"
            ? "Executing…"
            : acquisition?.status === "failed"
              ? "Retry acquisition"
              : "Execute acquisition",
        )
      : null,
    acquisition
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "p",
            null,
            `Queries ${view!.counters.queries} · provider requests ${view!.counters.requests}`,
          ),
          React.createElement(
            "p",
            null,
            `Discovered ${view!.counters.discovered} · accepted ${view!.counters.accepted} · rejected ${view!.counters.rejected}`,
          ),
          acquisition.failureCode
            ? React.createElement("p", { role: "status" }, view!.failure)
            : null,
        )
      : null,
  );
}
