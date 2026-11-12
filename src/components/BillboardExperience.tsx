"use client";
import { useEffect, useState } from "react";
import type { MpSdk } from "@matterport/sdk";
import { isBillboard, type Billboard } from "@/data/billboards";
import BillboardLayer from "./BillboardLayer";
import styles from "./Billboards.module.css";

export default function BillboardExperience({ sdk, viewer, admin, revision, onOpen }: {
  sdk: MpSdk | null; viewer: HTMLElement | null; admin: boolean; revision: number; onOpen: (billboard: Billboard) => void;
}) {
  const [items, setItems] = useState<Billboard[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch(admin ? "/api/admin/billboards" : "/api/billboards", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (!Array.isArray(data) || !data.every(isBillboard)) throw new Error();
        if (active) { setItems(data); setError(""); }
      } catch { if (active) { setItems([]); setError("Billboards could not be loaded. Refresh to try again."); } }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [admin, revision]);
  return <>
    {sdk && viewer && <BillboardLayer sdk={sdk} viewer={viewer} billboards={items} admin={admin} onOpen={onOpen} />}
    {error && <p role="status" className={styles.billboardNotice}>{error}</p>}
  </>;
}
