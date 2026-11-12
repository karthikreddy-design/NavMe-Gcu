"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { MpSdk } from "@matterport/sdk";
import type { Building, WorldPosition } from "@/data/buildings";
import { isBillboard, type Billboard, type BillboardMedia } from "@/data/billboards";
import styles from "./Billboards.module.css";

type Draft = Omit<Billboard, "position"> & { position: WorldPosition | null };
const emptyDraft = (): Draft => ({ id: "", title: "", description: "", position: null, media: [], published: false, enabled: true });
type Props = { sdk: MpSdk | null; buildings: readonly Building[]; onChanged: () => void; onPreview: (billboard: Billboard) => void };

export default function BillboardEditor({ sdk, buildings, onChanged, onPreview }: Props) {
  const [items, setItems] = useState<Billboard[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const [hit, setHit] = useState<WorldPosition | null>(null);
  const disabled = busy || uploading || loading;

  useEffect(() => {
    let active = true;
    fetch("/api/admin/billboards", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error("Could not load billboards. Your session may have expired; sign out and sign in again.");
      const data = await r.json();
      if (!Array.isArray(data) || !data.every(isBillboard)) throw new Error("Invalid billboard data.");
      if (active) setItems(data);
    }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!sdk) return;
    const sub = sdk.Pointer.intersection.subscribe((intersection) => {
      if (!armedRef.current || intersection.object !== sdk.Pointer.Colliders.MODEL) return;
      const { x, y, z } = intersection.position;
      if ([x, y, z].every(Number.isFinite)) setHit({ x, y, z });
    });
    return () => { sub.cancel(); };
  }, [sdk]);

  function stopCapture() { armedRef.current = false; setArmed(false); setHit(null); }
  function edit(item?: Billboard) {
    stopCapture(); setDraft(item ? { ...item, media: [...item.media] } : emptyDraft()); setError(""); setMessage("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || !draft.position) { setError("Select a billboard position before saving."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const billboard = { ...draft, id: draft.id || crypto.randomUUID(), title: draft.title.trim(), position: draft.position };
      const response = await fetch("/api/admin/billboards", { method: "PUT", headers: { "Content-Type": "application/json", "x-survey-mode": "1" }, body: JSON.stringify(billboard) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save.");
      setItems(data); setDraft(billboard); stopCapture(); onChanged();
      setMessage(billboard.published && billboard.enabled ? "Saved and published. Visitors can now see this billboard." : "Saved privately. Publish and enable it when it is ready for visitors.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save billboard."); }
    finally { setBusy(false); }
  }
  async function remove(item: Billboard) {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/billboards?id=${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { "x-survey-mode": "1" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete.");
      setItems(data); if (draft.id === item.id) edit(); onChanged(); setMessage("Billboard deleted.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete billboard."); }
    finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || disabled) return;
    if (files.length + draft.media.length > 20) { setError("Use up to 20 photos and videos per billboard."); return; }
    setUploading(true); setError(""); setMessage("");
    try {
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is larger than 50 MB.`);
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/admin/media", { method: "POST", headers: { "x-survey-mode": "1" }, body: form });
        const data: BillboardMedia & { error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error || "Upload failed.");
        setDraft((d) => ({ ...d, media: [...d.media, { id: data.id, name: data.name, type: data.type, url: data.url }] }));
      }
      setMessage("Media uploaded. Save the billboard to keep these attachments on its card.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); }
  }

  return <aside className={styles.adminPanel} aria-label="Billboard management">
    <header className={styles.editorHeader}><div><span className={styles.eyebrow}>GCU / SURVEY</span><h1>Billboards</h1></div>
      <button className={styles.secondary} onClick={() => edit()} disabled={disabled}>+ Add billboard</button></header>
    <p className={styles.help}>Place a billboard on the model. Visitors can open its photos, videos and story.</p>
    <div className={styles.savedList} aria-label="Saved billboards">
      {loading ? <p>Loading billboards…</p> : items.length === 0 ? <p className={styles.help}>No billboards yet. Add your first one below.</p> : items.map((item) =>
        <div className={styles.savedRow} key={item.id}>
          <button className={styles.savedName} onClick={() => edit(item)} disabled={disabled} aria-label={`Edit ${item.title}`}><strong>{item.title}</strong><small>{!item.enabled ? "Disabled" : item.published ? "Published" : "Draft"}</small></button>
          <button className={styles.textButton} onClick={() => onPreview(item)} disabled={disabled}>Preview</button>
          <button className={styles.danger} onClick={() => remove(item)} disabled={disabled}>Delete</button>
        </div>)}
    </div>
    <form onSubmit={save}>
      <fieldset disabled={disabled} className={styles.form}>
        <legend>{draft.id ? "Edit billboard" : "New billboard"}</legend>
        <label>Title<input required maxLength={150} placeholder="e.g. Discover the library" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label>Description<textarea aria-label="Description" maxLength={10000} rows={4} placeholder="Tell visitors about this space…" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <div className={styles.positionBlock}><h2>Position in the campus</h2>
          <p className={styles.help}>Capture a surface point in the model, or start at an existing space anchor.</p>
          <label>Use a saved space anchor<select value="" onChange={(e) => {
            const building = buildings.find((b) => b.id === e.target.value);
            if (building) { stopCapture(); setDraft({ ...draft, position: { ...building.position } }); }
          }}><option value="">Choose a saved space…</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <button className={styles.secondary} type="button" disabled={!sdk} onClick={() => {
            armedRef.current = !armed; setArmed(!armed); setHit(null);
          }}>{armed ? "Cancel position capture" : "Select position in model"}</button>
          {armed && <div className={styles.captureHint}><p>Aim at the desired surface in the tour, then use the captured point below.</p>
            <button type="button" className={styles.primary} disabled={!hit} onClick={() => {
              if (hit) setDraft({ ...draft, position: hit }); stopCapture();
            }}>Use this position</button></div>}
          {draft.position && <p className={styles.coordinates}>Saved anchor: {draft.position.x.toFixed(2)}, {draft.position.y.toFixed(2)}, {draft.position.z.toFixed(2)}</p>}
        </div>
        <div className={styles.positionBlock}><h2>Photos & videos</h2>
          <label className={styles.uploadArea}>Upload photos or videos<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>
          <p className={styles.help}>JPEG, PNG, WebP, GIF, MP4 or WebM · 50 MB per file · up to 20 files</p>
          <div className={styles.mediaList}>{draft.media.map((media) => <div className={styles.mediaRow} key={media.id}>
            {media.type === "image" ? <Image unoptimized src={media.url} alt="" width={52} height={44} /> : <span className={styles.videoBadge}>VIDEO</span>}
            <span>{media.name}</span><button type="button" className={styles.danger} aria-label={`Remove ${media.name}`} onClick={() => setDraft({ ...draft, media: draft.media.filter((m) => m.id !== media.id) })}>Remove</button>
          </div>)}</div>
        </div>
        <label>Visibility<select aria-label="Visibility" value={draft.published ? "published" : "draft"} onChange={(e) => setDraft({ ...draft, published: e.target.value === "published" })}>
          <option value="draft">Draft — admin preview only</option><option value="published">Published — visible to visitors</option></select></label>
        <label className={styles.checkbox}><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />Enabled</label>
        <div className={styles.editorActions}>
          <button className={styles.primary} type="submit" disabled={!draft.position || !draft.title.trim()}>Save billboard</button>
          <button className={styles.secondary} type="button" disabled={!draft.title.trim()} onClick={() => onPreview({ ...draft, id: draft.id || "preview", position: draft.position ?? { x: 0, y: 0, z: 0 } })}>Preview content card</button>
        </div>
      </fieldset>
    </form>
    {(busy || uploading) && <p role="status" className={styles.help}>{uploading ? "Uploading media…" : "Saving changes…"}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </aside>;
}
