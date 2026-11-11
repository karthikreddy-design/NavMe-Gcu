"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getSnapshot() {
  return new URLSearchParams(window.location.search).get("survey") === "1";
}

export function useSurveyMode() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
