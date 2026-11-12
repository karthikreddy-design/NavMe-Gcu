"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MpSdk } from "@matterport/sdk";
import type { Building } from "@/data/buildings";
import type { Billboard } from "@/data/billboards";
import AnchorSurvey from "./AnchorSurvey";
import BillboardEditor from "./BillboardEditor";
import styles from "./Billboards.module.css";

type Props = {
  sdk: MpSdk | null; buildings: readonly Building[]; storageReady: boolean; storageError: string;
  onSaveBuildings: (items: Building[]) => Promise<boolean>; onAuthorization: (authorized: boolean) => void;
  onBillboardsChanged: () => void; onPreview: (billboard: Billboard) => void;
};
export default function SurveyWorkspace(props: Props) {
  const { onAuthorization } = props;
  const [session, setSession] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"billboards" | "buildings">("billboards");
  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (active) { setSession(data); onAuthorization(data.authenticated); }
    }).catch(() => { if (active) setError("Could not check admin access. Refresh to retry."); });
    return () => { active = false; onAuthorization(false); };
  }, [onAuthorization]);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json", "x-survey-mode": "1" }, body: JSON.stringify({ password, setup: !session.configured }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSession(data); setPassword(""); onAuthorization(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/session", { method: "DELETE", headers: { "x-survey-mode": "1" } });
      if (!r.ok) throw new Error();
      setSession({ configured: true, authenticated: false }); onAuthorization(false);
    } catch { setError("Could not sign out. Please retry."); }
    finally { setBusy(false); }
  }
  if (!session?.authenticated) return <aside className={styles.adminPanel} aria-label="Survey admin sign in">
    <span className={styles.eyebrow}>GCU / SURVEY ACCESS</span><h1>{session?.configured ? "Admin sign in" : "Set up survey access"}</h1>
    <p className={styles.help}>Sign in to manage billboards and building labels. The visitor tour stays read-only.</p>
    {session && <form onSubmit={login} className={styles.form}>
      <label>{session.configured ? "Admin password" : "Create an admin password"}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={session.configured ? 1 : 12} maxLength={256} required autoComplete={session.configured ? "current-password" : "new-password"} /></label>
      {!session.configured && <p className={styles.help}>Use at least 12 characters. First-time setup is available only on localhost. Keep this password for future editing.</p>}
      <button className={styles.primary} disabled={busy}>{busy ? "Please wait…" : session.configured ? "Sign in" : "Create password and continue"}</button>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <Link className={styles.visitorLink} href="/" target="_blank" rel="noopener noreferrer">Open visitor tour ↗</Link>
  </aside>;
  return <>
    <nav className={styles.adminToolbar} aria-label="Survey tools">
      <button aria-pressed={tab === "billboards"} onClick={() => setTab("billboards")}>Billboards</button>
      <button aria-pressed={tab === "buildings"} onClick={() => setTab("buildings")}>Building labels</button>
      <button onClick={logout} disabled={busy}>Sign out</button>
    </nav>
    {error && <p className={styles.workspaceError} role="alert">{error}</p>}
    {tab === "billboards" && <BillboardEditor sdk={props.sdk} buildings={props.buildings} onChanged={props.onBillboardsChanged} onPreview={props.onPreview} />}
    {tab === "buildings" && (props.sdk
      ? <AnchorSurvey sdk={props.sdk} buildings={props.buildings} storageReady={props.storageReady} storageError={props.storageError} onSave={props.onSaveBuildings} />
      : <aside className={styles.adminPanel}><p>Connecting to the campus model…</p></aside>)}
  </>;
}
