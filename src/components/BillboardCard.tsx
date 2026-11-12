"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import type { Billboard } from "@/data/billboards";
import styles from "./Billboards.module.css";

export default function BillboardCard({ billboard, onClose }: { billboard: Billboard; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog className={styles.dialog} ref={dialog} aria-labelledby="billboard-title" onCancel={onClose}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <article className={styles.contentCard}>
      <header className={styles.cardHeader}>
        <div><span className={styles.eyebrow}>EXPLORE GCU</span><h2 id="billboard-title">{billboard.title}</h2></div>
        <button className={styles.close} onClick={onClose} aria-label="Close billboard" autoFocus>×</button>
      </header>
      {billboard.description && <p className={styles.description}>{billboard.description}</p>}
      {billboard.media.length > 0 && <div className={styles.gallery}>
        {billboard.media.map((media) => <figure key={media.id}>
          {media.type === "image"
            ? <Image src={media.url} alt={media.name} width={960} height={640} unoptimized className={styles.galleryImage} />
            : <video src={media.url} controls playsInline preload="metadata" className={styles.video} aria-label={media.name} />}
          <figcaption>{media.name}</figcaption>
        </figure>)}
      </div>}
      <footer className={styles.cardFooter}><button className={styles.secondary} onClick={onClose}>Close and continue exploring</button></footer>
    </article>
  </dialog>;
}
